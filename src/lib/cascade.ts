import "server-only";
import type { Types } from "mongoose";
import { serializeAttemptSummary } from "@/lib/attempts";
import { deleteKeys } from "@/lib/storage";
import { Attempt } from "@/models/Attempt";
import { Lesson } from "@/models/Lesson";
import { Message } from "@/models/Message";
import { Problem } from "@/models/Problem";
import { Share } from "@/models/Share";
import { Sketch } from "@/models/Sketch";
import { Solution } from "@/models/Solution";

const STORED_FILE_FIELDS = { images: 1, specKey: 1, specVersions: 1 } as const;

type WithStoredKeys = {
  images?: { storageKey: string }[] | null;
  specKey?: string | null;
  specVersions?: { specKey?: string | null }[] | null;
};

function attemptStoredKeys(a: WithStoredKeys): string[] {
  return [
    ...(a.images ?? []).map((i) => i.storageKey),
    ...(a.specKey ? [a.specKey] : []),
    ...(a.specVersions ?? []).map((v) => v.specKey).filter((k): k is string => Boolean(k)),
  ];
}

// Best effort: orphaned objects are harmless and the DB is the source of truth.
async function cleanupFiles(keys: string[]) {
  await deleteKeys(keys).catch((err) => console.error("[cascade] file cleanup failed:", err instanceof Error ? err.message : err));
}

/** Deletes a problem and everything hanging off it, including stored files. */
export async function deleteProblemCascade(userId: string, problemId: Types.ObjectId) {
  const attempts = await Attempt.find({ problemId, userId }).select(STORED_FILE_FIELDS).lean();
  const solutions = await Solution.find({ problemId, userId }).select({ specKey: 1 }).lean();
  const lessons = await Lesson.find({ problemId, userId }).select({ specKey: 1 }).lean();
  await Message.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) }, userId });
  await Message.deleteMany({ solutionId: { $in: solutions.map((s) => s._id) }, userId });
  await Attempt.deleteMany({ problemId, userId });
  await Solution.deleteMany({ problemId, userId });
  await Share.deleteMany({ problemId, userId });
  await Sketch.deleteMany({ problemId, userId });
  await Lesson.deleteMany({ problemId, userId });
  await Problem.deleteOne({ _id: problemId, userId });
  await cleanupFiles([
    ...attempts.flatMap(attemptStoredKeys),
    ...[...solutions, ...lessons].flatMap((s) => (s.specKey ? [s.specKey] : [])),
  ]);
}

/**
 * Deletes one attempt, its chat and stored files, and points the problem's
 * latest attempt and verdict at the newest one that's left.
 */
export async function deleteAttemptCascade(
  userId: string,
  attempt: WithStoredKeys & { _id: Types.ObjectId; problemId: Types.ObjectId },
  /** `keepImages` leaves the uploaded photos in storage, for a discarded run whose form still points at them. */
  opts: { keepImages?: boolean } = {},
) {
  await Message.deleteMany({ attemptId: attempt._id, userId });
  await Share.deleteMany({ kind: "attempt", targetId: attempt._id, userId });
  const { deletedCount } = await Attempt.deleteOne({ _id: attempt._id, userId });
  if (!deletedCount) return;

  const newest = await Attempt.findOne({ problemId: attempt.problemId, userId })
    .sort({ version: -1 })
    .select({ version: 1, status: 1, createdAt: 1, verdict: 1 })
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
  await cleanupFiles(attemptStoredKeys(opts.keepImages ? { ...attempt, images: [] } : attempt));
}

/** Deletes one solution, its chat and its stored walkthrough. */
export async function deleteSolutionCascade(userId: string, solution: { _id: Types.ObjectId; specKey?: string | null }) {
  await Message.deleteMany({ solutionId: solution._id, userId });
  await Share.deleteMany({ kind: "solution", targetId: solution._id, userId });
  const { deletedCount } = await Solution.deleteOne({ _id: solution._id, userId });
  if (deletedCount && solution.specKey) await cleanupFiles([solution.specKey]);
}
