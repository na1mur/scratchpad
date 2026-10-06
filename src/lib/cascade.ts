import "server-only";
import type { Types } from "mongoose";
import { deleteKeys } from "@/lib/r2";
import { Attempt } from "@/models/Attempt";
import { Message } from "@/models/Message";
import { Problem } from "@/models/Problem";

/** Deletes a problem and everything hanging off it, including R2 objects. */
export async function deleteProblemCascade(userId: string, problemId: Types.ObjectId) {
  const attempts = await Attempt.find({ problemId, userId }).select({ images: 1, specR2Key: 1, specVersions: 1 }).lean();
  const keys = attempts.flatMap((a) => [
    ...(a.images ?? []).map((i) => i.r2Key),
    ...(a.specR2Key ? [a.specR2Key] : []),
    ...(a.specVersions ?? []).map((v) => v.specR2Key).filter((k): k is string => Boolean(k)),
  ]);
  await Message.deleteMany({ attemptId: { $in: attempts.map((a) => a._id) }, userId });
  await Attempt.deleteMany({ problemId, userId });
  await Problem.deleteOne({ _id: problemId, userId });
  // Best effort: orphaned objects are harmless and the DB is the source of truth.
  await deleteKeys(keys).catch((err) => console.error("[cascade] R2 cleanup failed:", err instanceof Error ? err.message : err));
}
