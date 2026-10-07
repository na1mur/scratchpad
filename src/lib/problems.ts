import "server-only";
import { Types, type QueryFilter } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PAGE_SIZE, type ListProblemsQuery } from "@/lib/schemas/problems";
import { TAGS, type Tag } from "@/lib/tags";
import { Problem, type ProblemDoc } from "@/models/Problem";

export function serializeProblemSummary(p: ProblemDoc) {
  return {
    id: String(p._id),
    title: p.title,
    tags: p.tags as Tag[],
    tagsSource: p.tagsSource,
    attemptCount: p.attemptCount,
    lastVerdict: p.lastVerdict ?? null,
    updatedAt: p.updatedAt.toISOString(),
  };
}
export type ProblemSummary = ReturnType<typeof serializeProblemSummary>;

export function serializeProblem(p: ProblemDoc) {
  return {
    ...serializeProblemSummary(p),
    statement: p.statement,
    sourceUrl: p.sourceUrl ?? null,
    language: p.language,
    latestAttemptId: p.latestAttemptId ? String(p.latestAttemptId) : null,
    createdAt: p.createdAt.toISOString(),
  };
}
export type ProblemDetail = ReturnType<typeof serializeProblem>;

export async function listProblems(userId: string, query: ListProblemsQuery) {
  await connectDB();
  const filter: QueryFilter<ProblemDoc> = { userId: new Types.ObjectId(userId) };
  if (query.tag) filter.tags = query.tag;
  if (query.q) filter.$text = { $search: query.q };

  const total = await Problem.countDocuments(filter);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);

  const items = await Problem.find(filter, query.q ? { score: { $meta: "textScore" } } : {})
    .sort(query.q ? { score: { $meta: "textScore" }, updatedAt: -1 } : { updatedAt: -1 })
    .skip((page - 1) * PAGE_SIZE)
    .limit(PAGE_SIZE)
    .lean();

  return { items: items.map(serializeProblemSummary), page, pageCount, total };
}

/** Tags the user actually has, in canonical order; drives the list tabs. */
export async function distinctTags(userId: string): Promise<Tag[]> {
  await connectDB();
  const used = new Set<string>(await Problem.distinct("tags", { userId: new Types.ObjectId(userId) }));
  return TAGS.filter((t) => used.has(t));
}

/** Ownership is enforced here: the id alone is never enough. */
export async function getOwnedProblem(userId: string, problemId: string): Promise<ProblemDoc> {
  if (!Types.ObjectId.isValid(problemId)) throw new ApiError(404, "not_found", "Problem not found.");
  await connectDB();
  const problem = await Problem.findOne({ _id: problemId, userId }).lean();
  if (!problem) throw new ApiError(404, "not_found", "Problem not found.");
  return problem;
}
