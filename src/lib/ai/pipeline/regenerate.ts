import "server-only";
import type { LanguageModel } from "ai";
import type { Understanding } from "@/lib/ai/schemas/pipeline";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { storeSpec } from "@/lib/specStorage";
import { Attempt, type AttemptDoc } from "@/models/Attempt";
import { Problem } from "@/models/Problem";
import { UsageMeter } from "./llm";
import { traceAndDiagnose } from "./run";
import { understand, type Ctx, type Guidance } from "./stages";

/**
 * Re-runs stages 2–3 for an existing attempt with guidance from a follow-up
 * question and appends the result to `specVersions`. A new test input means
 * re-running stage 1 as well, since it owns the input's arguments.
 */
export async function regenerateSpec(opts: {
  attempt: AttemptDoc;
  model: LanguageModel;
  language: string;
  statement: string;
  source?: string;
  reference?: string;
  guidance: Guidance;
  focusDescription?: string;
}): Promise<{ specVersion: number; spec: VizSpec; usage: ReturnType<UsageMeter["snapshot"]> }> {
  const { attempt, guidance } = opts;
  const meter = new UsageMeter();
  const ctx: Ctx = {
    model: opts.model,
    meter,
    learner: {
      statement: opts.statement,
      source: opts.source,
      pseudoCode: attempt.pseudoCode,
      idea: attempt.idea ?? "",
      language: opts.language,
    },
    reference: opts.reference,
  };
  const fullGuidance: Guidance = {
    ...guidance,
    focus: [guidance.focus, opts.focusDescription].filter(Boolean).join("\n") || undefined,
  };

  let u = attempt.understanding as Understanding | undefined;
  if (!u || guidance.newTestInput) u = await understand(ctx, fullGuidance);

  const { spec } = await traceAndDiagnose(ctx, u, { guidance: fullGuidance });
  const nextVersion = (attempt.specVersions?.length ?? 0) + 1;
  const stored = await storeSpec(String(attempt.userId), String(attempt.problemId), String(attempt._id), nextVersion, spec);
  const usage = meter.snapshot();

  await Attempt.updateOne(
    { _id: attempt._id },
    {
      $push: { specVersions: { createdAt: new Date(), reason: guidance.reason.slice(0, 200), ...stored } },
      $inc: {
        "tokenUsage.inputTokens": usage.inputTokens,
        "tokenUsage.outputTokens": usage.outputTokens,
        "tokenUsage.totalTokens": usage.totalTokens,
      },
    },
  );
  // The newest spec's verdict is the one the problem list should show.
  await Problem.updateOne(
    { _id: attempt.problemId, latestAttemptId: attempt._id },
    { $set: { lastVerdict: spec.summary.verdict } },
  );
  return { specVersion: nextVersion, spec, usage };
}
