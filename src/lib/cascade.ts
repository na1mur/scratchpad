import "server-only";
import type { Types } from "mongoose";
import { Problem } from "@/models/Problem";

/** Deletes a problem and everything hanging off it. */
export async function deleteProblemCascade(userId: string, problemId: Types.ObjectId) {
  await Problem.deleteOne({ _id: problemId, userId });
}
