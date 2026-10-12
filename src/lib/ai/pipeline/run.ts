import "server-only";
import { ApiError } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import type { DiagnosisOutput, Understanding } from "@/lib/ai/schemas/pipeline";
import { formatSpecIssues, vizSpecSchema, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { deleteAttemptCascade } from "@/lib/cascade";
import { connectDB } from "@/lib/db";
import { clearKeyRejected, markMainKeyRejected } from "@/lib/providerKeys";
import { rateLimits } from "@/lib/rateLimit";
import { storeSpec } from "@/lib/specStorage";
import { ensureProblemReference } from "@/lib/problemReference";
import { userSearchKey } from "@/lib/tavily";
import { ensureProblemSource } from "@/lib/problemSource";
import { normalizeTags } from "@/lib/tags";
import { Attempt, type AttemptStatus } from "@/models/Attempt";
import { Problem } from "@/models/Problem";
import { User } from "@/models/User";
import { emit } from "./events";
import { endRun, startRun } from "./cancel";
import { PipelineError, RunCancelledError, UsageMeter, throwIfCancelled } from "./llm";
import { ProgressTracker } from "./progress";
import {
  assemble,
  diagnose,
  diagnosisText,
  revealsSolution,
  traceCases,
  understand,
  type Ctx,
  type Guidance,
  type TraceResult,
} from "./stages";

/** Also where a stop lands: the signal is checked, and an attempt the cancel route already removed ends the run. */
async function setStatus(attemptId: string, status: AttemptStatus, signal: AbortSignal) {
  throwIfCancelled(signal);
  const { matchedCount } = await Attempt.updateOne({ _id: attemptId }, { $set: { status } });
  if (!matchedCount) throw new RunCancelledError();
  emit(attemptId, { type: "status", status });
}

/** Stage 3 plus the guardrail. */
async function diagnoseChecked(ctx: Ctx, u: Understanding, trace: TraceResult): Promise<DiagnosisOutput> {
  let d = await diagnose(ctx, u, trace);
  ctx.progress?.update((p) => void (p.check = "checking"));
  const check = await revealsSolution(ctx, diagnosisText(d));
  if (check.reveals) {
    ctx.progress?.update((p) => void (p.check = "rewording"));
    d = await diagnose(ctx, u, trace, true);
    // Still leaking after one stricter retry: drop the hints and the new angle rather than ship them.
    const recheck = await revealsSolution(ctx, diagnosisText(d));
    if (recheck.reveals) d = { ...d, thinkingHints: [], shiftInThinking: "" };
  }
  ctx.progress?.update((p) => void (p.check = "done"));
  return d;
}

/**
 * Stages 2–3 plus the guardrail. Shared by first runs and regenerations. The diagnosis works from the
 * raw traces while their steps are still being narrated.
 */
export async function traceAndDiagnose(
  ctx: Ctx,
  u: Understanding,
  opts: { onStage?: (s: "tracing" | "diagnosing") => Promise<void>; guidance?: Guidance } = {},
): Promise<{ spec: VizSpec; mode: "execution" | "simulation" }> {
  await opts.onStage?.("tracing");
  const { trace: raw, narrated } = await traceCases(ctx, u, opts.guidance);

  await opts.onStage?.("diagnosing");
  const [d, trace] = await Promise.all([diagnoseChecked(ctx, u, raw), narrated]);

  const spec = assemble(trace, d, u);
  const parsed = vizSpecSchema.safeParse(spec);
  if (!parsed.success) {
    console.error("[pipeline] assembled spec invalid:", formatSpecIssues(parsed.error, 5));
    throw new PipelineError("invalid_output", "The visualization came out malformed. Please try again.");
  }
  return { spec: parsed.data, mode: trace.mode };
}

/**
 * Runs the whole pipeline for one attempt, persisting status after every
 * stage so a reload can pick up progress. Never throws: a failed run is
 * discarded (or, if that fails, stored as an error) and the failure emitted.
 */
export async function runAttemptPipeline(attemptId: string): Promise<void> {
  await connectDB();
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) return;
  const meter = new UsageMeter();
  const signal = startRun(attemptId);
  // Only while it's still running, so a late snapshot can't land on a finished or removed attempt.
  const progress = new ProgressTracker(async (snapshot) => {
    await Attempt.updateOne({ _id: attemptId, status: { $nin: ["done", "error"] } }, { $set: { progress: snapshot } });
    emit(attemptId, { type: "progress", progress: snapshot });
  });

  try {
    const [problem, user] = await Promise.all([
      Problem.findOne({ _id: attempt.problemId, userId: attempt.userId }).lean(),
      User.findById(attempt.userId).lean(),
    ]);
    if (!problem || !user) throw new PipelineError("not_found", "This problem no longer exists.");

    const { model } = getModel(user, "reasoning");
    const [source, reference] = await Promise.all([
      ensureProblemSource(problem),
      ensureProblemReference(problem, problem.language, userSearchKey(user)),
    ]);
    const ctx: Ctx = {
      model,
      meter,
      learner: {
        statement: problem.statement,
        source,
        pseudoCode: attempt.pseudoCode,
        idea: attempt.idea ?? "",
        language: problem.language,
      },
      reference: reference?.text,
      signal,
      progress,
    };

    await setStatus(attemptId, "understanding", signal);
    const u = await understand(ctx);
    await Attempt.updateOne({ _id: attemptId }, { $set: { understanding: u } });
    progress.update((p) => void (p.approach = u.userApproachInOwnWords));

    const { spec, mode } = await traceAndDiagnose(ctx, u, { onStage: (s) => setStatus(attemptId, s, signal) });

    // Auto-tags only fill in for problems the learner left untagged.
    const autoTags = problem.tagsSource === "none" ? normalizeTags(u.suggestedTags) : [];
    throwIfCancelled(signal);
    const finalSpec: VizSpec = autoTags.length ? { ...spec, autoTags } : spec;
    const stored = await storeSpec(String(attempt.userId), String(attempt.problemId), attemptId, 1, finalSpec);
    await progress.flush();

    await Attempt.updateOne(
      { _id: attemptId },
      {
        $set: {
          status: "done",
          traceMode: mode,
          ...stored,
          specVersions: [{ createdAt: new Date(), reason: "Initial run", ...stored }],
          tokenUsage: meter.snapshot(),
        },
        $unset: { progress: 1 },
      },
    );
    await Problem.updateOne(
      { _id: problem._id, latestAttemptId: attempt._id },
      { $set: { lastVerdict: finalSpec.summary.verdict } },
    );
    if (autoTags.length) {
      await Problem.updateOne({ _id: problem._id, tagsSource: "none" }, { $set: { tags: autoTags, tagsSource: "auto" } });
    }
    // The key worked, so it's no longer one the provider refused.
    await clearKeyRejected(user.ai?.keyId).catch(() => {});
    emit(attemptId, { type: "status", status: "done" });
    emit(attemptId, { type: "done", attemptId });
  } catch (err) {
    const safe =
      err instanceof PipelineError || err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: "internal", message: "Something went wrong while processing. Please try again." };
    if (!(err instanceof PipelineError || err instanceof ApiError)) {
      console.error(`[pipeline] attempt ${attemptId} failed:`, err instanceof Error ? err.message : err);
    }
    // Flag a refused key so Settings can point at it.
    if (safe.code === "invalid_key") await markMainKeyRejected(attempt.userId).catch(() => {});
    // A failed run doesn't use up the learner's hourly allowance, so they can retry with another model.
    await rateLimits.attempts().refund(String(attempt.userId)).catch(() => {});
    // A run that never produced a result isn't an attempt: remove it so it doesn't take a version number or
    // count toward the problem. The form still holds the learner's text and photos for the retry.
    const discarded = await deleteAttemptCascade(String(attempt.userId), attempt.toObject(), { keepImages: true })
      .then(() => true)
      .catch((e) => {
        console.error(`[pipeline] couldn't discard failed attempt ${attemptId}:`, e instanceof Error ? e.message : e);
        return false;
      });
    if (!discarded) {
      await Attempt.updateOne(
        { _id: attemptId },
        { $set: { status: "error", error: safe, tokenUsage: meter.snapshot() }, $unset: { progress: 1 } },
      ).catch(() => {});
      emit(attemptId, { type: "status", status: "error" });
    }
    emit(attemptId, { type: "error", ...safe, discarded });
  } finally {
    endRun(attemptId);
  }
}
