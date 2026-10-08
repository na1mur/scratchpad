import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import type { SolutionContent } from "@/lib/ai/schemas/solution";
import { connectDB } from "@/lib/db";
import { loadSpec } from "@/lib/specStorage";
import { Solution, type SolutionDoc, type SolutionStatus } from "@/models/Solution";

export const SOLUTION_IN_PROGRESS: ReadonlySet<SolutionStatus> = new Set(["queued", "solving", "tracing", "narrating"]);

// A pipeline that hasn't touched its solution for this long died with the server process.
const STALE_AFTER_MS = 15 * 60_000;

export async function getOwnedSolution(userId: string, solutionId: string): Promise<SolutionDoc> {
  if (!Types.ObjectId.isValid(solutionId)) throw new ApiError(404, "not_found", "Solution not found.");
  await connectDB();
  const solution = await Solution.findOne({ _id: solutionId, userId }).lean();
  if (!solution) throw new ApiError(404, "not_found", "Solution not found.");
  if (SOLUTION_IN_PROGRESS.has(solution.status) && Date.now() - solution.updatedAt.getTime() > STALE_AFTER_MS) {
    const error = { code: "interrupted", message: "Writing the solution was interrupted. Please try again." };
    await Solution.updateOne({ _id: solution._id, status: solution.status }, { $set: { status: "error", error } });
    return { ...solution, status: "error", error };
  }
  return solution;
}

/** Fields the version picker needs; keeps list queries light. */
export const SOLUTION_SUMMARY_FIELDS = {
  version: 1,
  status: 1,
  request: 1,
  createdAt: 1,
  "content.name": 1,
  "content.complexity": 1,
} as const;

export function serializeSolutionSummary(s: Pick<SolutionDoc, "_id" | "version" | "status" | "request" | "createdAt" | "content">) {
  const c = s.content as Partial<SolutionContent> | undefined;
  return {
    id: String(s._id),
    version: s.version,
    status: s.status,
    requestKind: s.request?.kind ?? "initial",
    name: c?.name ?? null,
    time: c?.complexity?.time ?? null,
    space: c?.complexity?.space ?? null,
    createdAt: s.createdAt.toISOString(),
  };
}
export type SolutionSummary = ReturnType<typeof serializeSolutionSummary>;

export async function serializeSolution(s: SolutionDoc) {
  return {
    ...serializeSolutionSummary(s),
    problemId: String(s.problemId),
    requestNote: s.request?.note ?? "",
    basedOnAttemptVersion: s.basedOnAttemptVersion ?? null,
    language: s.language,
    content: s.status === "done" ? ((s.content as SolutionContent | undefined) ?? null) : null,
    vizSpec: s.status === "done" ? await loadSpec(s) : null,
    traceMode: s.traceMode ?? null,
    model: s.model ? { provider: s.model.provider, model: s.model.model } : null,
    tokenUsage: s.tokenUsage
      ? { inputTokens: s.tokenUsage.inputTokens, outputTokens: s.tokenUsage.outputTokens, totalTokens: s.tokenUsage.totalTokens }
      : null,
    error: s.status === "error" && s.error?.message ? { code: s.error.code ?? "error", message: s.error.message } : null,
  };
}
export type SolutionDetail = Awaited<ReturnType<typeof serializeSolution>>;
