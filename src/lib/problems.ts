import "server-only";
import { Types, type QueryFilter } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { PAGE_SIZE, type ListProblemsQuery } from "@/lib/schemas/problems";
import { problemSlugBase } from "@/lib/slug";
import { TAGS, type Tag } from "@/lib/tags";
import { Problem, type ProblemDoc } from "@/models/Problem";

export function serializeProblemSummary(p: ProblemDoc) {
  return {
    id: String(p._id),
    // What the page URL uses; problems from before slugs fall back to their id.
    slug: p.slug ?? String(p._id),
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

/**
 * Creates a problem under a slug built from its title and tags, adding -2, -3… when the user already has
 * that one. Two creations racing for the same slug are settled by the unique index: the loser retries.
 */
export async function createProblem(fields: Omit<Partial<ProblemDoc>, "slug"> & Pick<ProblemDoc, "userId" | "title">) {
  await connectDB();
  const base = problemSlugBase(fields.title, fields.tags ?? []);
  for (let attempt = 0; ; attempt++) {
    // Slugs are [a-z0-9-] only, so the base needs no escaping.
    const taken = await Problem.find({ userId: fields.userId, slug: { $regex: `^${base}(-\\d+)?$` } })
      .select({ slug: 1 })
      .lean();
    const used = new Set(taken.map((p) => p.slug));
    let n = 1;
    while (used.has(n === 1 ? base : `${base}-${n}`)) n++;
    try {
      return await Problem.create({ ...fields, slug: n === 1 ? base : `${base}-${n}` });
    } catch (err) {
      const duplicate = (err as { code?: number }).code === 11000;
      if (!duplicate || attempt >= 3) throw err;
    }
  }
}

/** Ownership is enforced here: the id alone is never enough. */
export async function getOwnedProblem(userId: string, problemId: string): Promise<ProblemDoc> {
  if (!Types.ObjectId.isValid(problemId)) throw new ApiError(404, "not_found", "Problem not found.");
  await connectDB();
  const problem = await Problem.findOne({ _id: problemId, userId }).lean();
  if (!problem) throw new ApiError(404, "not_found", "Problem not found.");
  return problem;
}

/** For pages: `ref` is the slug from the URL, or the id of a problem from before slugs. */
export async function getOwnedProblemBySlug(userId: string, ref: string): Promise<ProblemDoc> {
  await connectDB();
  const problem =
    (await Problem.findOne({ userId, slug: ref }).lean()) ??
    (Types.ObjectId.isValid(ref) ? await Problem.findOne({ _id: ref, userId }).lean() : null);
  if (!problem) throw new ApiError(404, "not_found", "Problem not found.");
  return problem;
}
