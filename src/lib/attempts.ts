import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { connectDB } from "@/lib/db";
import { r2Enabled, viewUrl } from "@/lib/r2";
import { loadSpec } from "@/lib/specStorage";
import type { Verdict } from "@/lib/verdicts";
import { Attempt, type AttemptDoc, type AttemptStatus } from "@/models/Attempt";

export const IN_PROGRESS: ReadonlySet<AttemptStatus> = new Set([
  "queued",
  "extracting",
  "understanding",
  "tracing",
  "diagnosing",
]);

// A pipeline that hasn't touched its attempt for this long died with the
// server process; surface that instead of spinning forever.
const STALE_AFTER_MS = 15 * 60_000;

export async function getOwnedAttempt(userId: string, attemptId: string): Promise<AttemptDoc> {
  if (!Types.ObjectId.isValid(attemptId)) throw new ApiError(404, "not_found", "Attempt not found.");
  await connectDB();
  const attempt = await Attempt.findOne({ _id: attemptId, userId }).lean();
  if (!attempt) throw new ApiError(404, "not_found", "Attempt not found.");
  if (IN_PROGRESS.has(attempt.status) && Date.now() - attempt.updatedAt.getTime() > STALE_AFTER_MS) {
    const error = { code: "interrupted", message: "Processing was interrupted. Please run it again." };
    await Attempt.updateOne({ _id: attempt._id, status: attempt.status }, { $set: { status: "error", error } });
    return { ...attempt, status: "error", error };
  }
  return attempt;
}

export function serializeAttemptSummary(a: AttemptDoc) {
  const spec = a.vizSpec as VizSpec | undefined;
  return {
    id: String(a._id),
    version: a.version,
    status: a.status,
    verdict: (spec?.summary.verdict ?? null) as Verdict | null,
    createdAt: a.createdAt.toISOString(),
  };
}
export type AttemptSummary = ReturnType<typeof serializeAttemptSummary>;

/** `specVersion` is 1-based; defaults to the newest. */
export async function serializeAttempt(a: AttemptDoc, specVersion?: number) {
  const versions = a.specVersions ?? [];
  const index = specVersion && specVersion >= 1 && specVersion <= versions.length ? specVersion - 1 : versions.length - 1;
  const chosen = index >= 0 ? versions[index] : null;
  const vizSpec = chosen ? await loadSpec(chosen) : await loadSpec(a);
  return {
    ...serializeAttemptSummary(a),
    problemId: String(a.problemId),
    pseudoCode: a.pseudoCode,
    idea: a.idea ?? "",
    images: await Promise.all(
      (a.images ?? []).map(async (img) => ({
        r2Key: img.r2Key,
        mimeType: img.mimeType,
        url: r2Enabled ? await viewUrl(img.r2Key).catch(() => null) : null,
      })),
    ),
    vizSpec,
    specVersion: index + 1,
    specVersions: versions.map((v, i) => ({ version: i + 1, createdAt: v.createdAt.toISOString(), reason: v.reason })),
    traceMode: a.traceMode ?? null,
    model: a.model ? { provider: a.model.provider, model: a.model.model } : null,
    tokenUsage: a.tokenUsage
      ? { inputTokens: a.tokenUsage.inputTokens, outputTokens: a.tokenUsage.outputTokens, totalTokens: a.tokenUsage.totalTokens }
      : null,
    error: a.status === "error" && a.error?.message ? { code: a.error.code ?? "error", message: a.error.message } : null,
  };
}
export type AttemptDetail = Awaited<ReturnType<typeof serializeAttempt>>;
