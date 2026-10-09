import "server-only";
import { ApiError } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import type { Understanding } from "@/lib/ai/schemas/pipeline";
import { formatSpecIssues, vizSpecSchema, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { deleteAttemptCascade } from "@/lib/cascade";
import { connectDB } from "@/lib/db";
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
import { PipelineError, UsageMeter } from "./llm";
import {
  assemble,
  diagnose,
  diagnosisText,
  revealsSolution,
  traceByExecution,
  traceBySimulation,
  understand,
  type Ctx,
  type Guidance,
} from "./stages";

async function setStatus(attemptId: string, status: AttemptStatus) {
  await Attempt.updateOne({ _id: attemptId }, { $set: { status } });
  emit(attemptId, { type: "status", status });
}

/** Stages 2–3 plus the guardrail. Shared by first runs and regenerations. */
export async function traceAndDiagnose(
  ctx: Ctx,
  u: Understanding,
  opts: { onStage?: (s: "tracing" | "diagnosing") => Promise<void>; guidance?: Guidance } = {},
): Promise<{ spec: VizSpec; mode: "execution" | "simulation" }> {
  await opts.onStage?.("tracing");
  const trace = (await traceByExecution(ctx, u, opts.guidance)) ?? (await traceBySimulation(ctx, u, opts.guidance));

  await opts.onStage?.("diagnosing");
  let d = await diagnose(ctx, u, trace);
  const check = await revealsSolution(ctx, diagnosisText(d));
  if (check.reveals) {
    d = await diagnose(ctx, u, trace, true);
    // Still leaking after one stricter retry: drop the hints and the new angle rather than ship them.
    const recheck = await revealsSolution(ctx, diagnosisText(d));
    if (recheck.reveals) d = { ...d, thinkingHints: [], shiftInThinking: "" };
  }

  const spec = assemble(trace, trace.steps, d, u);
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
    };

    await setStatus(attemptId, "understanding");
    const u = await understand(ctx);
    await Attempt.updateOne({ _id: attemptId }, { $set: { understanding: u } });

    const { spec, mode } = await traceAndDiagnose(ctx, u, { onStage: (s) => setStatus(attemptId, s) });

    // Auto-tags only fill in for problems the learner left untagged.
    const autoTags = problem.tagsSource === "none" ? normalizeTags(u.suggestedTags) : [];
    const finalSpec: VizSpec = autoTags.length ? { ...spec, autoTags } : spec;
    const stored = await storeSpec(String(attempt.userId), String(attempt.problemId), attemptId, 1, finalSpec);

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
      },
    );
    await Problem.updateOne(
      { _id: problem._id, latestAttemptId: attempt._id },
      { $set: { lastVerdict: finalSpec.summary.verdict } },
    );
    if (autoTags.length) {
      await Problem.updateOne({ _id: problem._id, tagsSource: "none" }, { $set: { tags: autoTags, tagsSource: "auto" } });
    }
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
        { $set: { status: "error", error: safe, tokenUsage: meter.snapshot() } },
      ).catch(() => {});
      emit(attemptId, { type: "status", status: "error" });
    }
    emit(attemptId, { type: "error", ...safe, discarded });
  }
}
