import "server-only";
import type { Types } from "mongoose";
import { serializeAttemptSummary } from "@/lib/attempts";
import { deleteKeys } from "@/lib/r2";
import { Attempt } from "@/models/Attempt";
import { Message } from "@/models/Message";
import { Problem } from "@/models/Problem";

const R2_FIELDS = { images: 1, specR2Key: 1, specVersions: 1 } as const;

type WithR2Keys = {
  images?: { r2Key: string }[] | null;
  specR2Key?: string | null;
  specVersions?: { specR2Key?: string | null }[] | null;
};

function attemptR2Keys(a: WithR2Keys): string[] {
  return [
    ...(a.images ?? []).map((i) => i.r2Key),
    ...(a.specR2Key ? [a.specR2Key] : []),
    ...(a.specVersions ?? []).map((v) => v.specR2Key).filter((k): k is string => Boolean(k)),
  ];
}

// Best effort: orphaned objects are harmless and the DB is the source of truth.
async function cleanupR2(keys: string[]) {
  await deleteKeys(keys).catch((err) => console.error("[cascade] R2 cleanup failed:", err instanceof Error ? err.message : err));
}

/** Deletes a problem and everything hanging off it, including R2 objects. */
export async function deleteProblemCascade(userId: string, problemId: Types.ObjectId) {
  const attempts = await Attempt.find({ problemId, userId }).select(R2_FIELDS).lean();
  await Message.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) }, userId });
  await Attempt.deleteMany({ problemId, userId });
  await Problem.deleteOne({ _id: problemId, userId });
  await cleanupR2(attempts.flatMap(attemptR2Keys));
}

/**
 * Deletes one attempt, its chat and R2 objects, and points the problem's
 * latest attempt and verdict at the newest one that's left.
 */
export async function deleteAttemptCascade(
  userId: string,
  attempt: WithR2Keys & { _id: Types.ObjectId; problemId: Types.ObjectId },
  /** `keepImages` leaves the uploaded photos in R2, for a discarded run whose form still points at them. */
  opts: { keepImages?: boolean } = {},
) {
  await Message.deleteMany({ attemptId: attempt._id, userId });
  const { deletedCount } = await Attempt.deleteOne({ _id: attempt._id, userId });
  if (!deletedCount) return;

  const newest = await Attempt.findOne({ problemId: attempt.problemId, userId })
    .sort({ version: -1 })
    .select({ version: 1, status: 1, createdAt: 1, "vizSpec.summary.verdict": 1 })
    .lean();
  const verdict = newest ? serializeAttemptSummary(newest).verdict : null;
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (newest) set.latestAttemptId = newest._id;
  else unset.latestAttemptId = 1;
  if (verdict) set.lastVerdict = verdict;
  else unset.lastVerdict = 1;
  await Problem.updateOne(
    { _id: attempt.problemId, userId },
    { $inc: { attemptCount: -1 }, ...(Object.keys(set).length && { $set: set }), ...(Object.keys(unset).length && { $unset: unset }) },
  );
  await cleanupR2(attemptR2Keys(opts.keepImages ? { ...attempt, images: [] } : attempt));
}
