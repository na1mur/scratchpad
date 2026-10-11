import "server-only";
import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { connectDB } from "@/lib/db";
import { createProblem } from "@/lib/problems";
import { serializeSolution } from "@/lib/solutions";
import { loadSpec } from "@/lib/specStorage";
import type { Tag } from "@/lib/tags";
import { Attempt } from "@/models/Attempt";
import { Problem, type ProblemDoc } from "@/models/Problem";
import { Share, type ShareDoc, type ShareKind } from "@/models/Share";
import { Solution } from "@/models/Solution";

/** Shares a finished attempt or solution the caller owns; sharing twice returns the same link. */
export async function createShare(userId: string, kind: ShareKind, targetId: string): Promise<string> {
  const target = await loadOwnedTarget(userId, kind, targetId);
  const share = await Share.findOneAndUpdate(
    { kind, targetId: target._id },
    { $setOnInsert: { token: randomBytes(12).toString("base64url"), problemId: target.problemId, userId } },
    { upsert: true, returnDocument: "after" },
  ).lean();
  return share!.token;
}

export async function removeShare(userId: string, kind: ShareKind, targetId: string) {
  const target = await loadOwnedTarget(userId, kind, targetId);
  await Share.deleteOne({ kind, targetId: target._id, userId });
}

async function loadOwnedTarget(userId: string, kind: ShareKind, targetId: string) {
  const notFound = new ApiError(404, "not_found", kind === "attempt" ? "Attempt not found." : "Solution not found.");
  if (!Types.ObjectId.isValid(targetId)) throw notFound;
  await connectDB();
  const filter = { _id: targetId, userId };
  const target =
    kind === "attempt"
      ? await Attempt.findOne(filter).select({ problemId: 1, status: 1 }).lean()
      : await Solution.findOne(filter).select({ problemId: 1, status: 1 }).lean();
  if (!target) throw notFound;
  // Only finished runs have something to show.
  if (target.status !== "done") throw new ApiError(409, "not_ready", "Only a finished run can be shared.");
  return target;
}

async function findShare(kind: ShareKind, token: string): Promise<ShareDoc | null> {
  if (!/^[\w-]{8,64}$/.test(token)) return null;
  await connectDB();
  return Share.findOne({ token, kind }).lean();
}

/** What a public page shows of the problem: never the fetched source text or reference solutions. */
function publicProblem(p: ProblemDoc) {
  return {
    title: p.title,
    statement: p.statement,
    tags: p.tags as Tag[],
    sourceUrl: p.sourceUrl ?? null,
    language: p.language,
  };
}
export type SharedProblem = ReturnType<typeof publicProblem>;

/** Owner of the share, so the page can offer "open yours" instead of a fork to them. */
const ownerOf = (share: ShareDoc, p: ProblemDoc) => ({ ownerId: String(share.userId), ownerSlug: p.slug ?? String(p._id) });

/** A shared attempt, or null when the link was never valid or has been unshared. */
export async function loadSharedAttempt(token: string) {
  const share = await findShare("attempt", token);
  if (!share) return null;
  const [attempt, problem] = await Promise.all([
    Attempt.findOne({ _id: share.targetId, userId: share.userId, status: "done" }).lean(),
    Problem.findOne({ _id: share.problemId, userId: share.userId }).lean(),
  ]);
  if (!attempt || !problem) return null;
  const versions = attempt.specVersions ?? [];
  const vizSpec: VizSpec | null = await loadSpec(versions.length ? versions[versions.length - 1] : attempt);
  if (!vizSpec) return null;
  return {
    ...ownerOf(share, problem),
    problem: publicProblem(problem),
    attempt: { version: attempt.version, pseudoCode: attempt.pseudoCode, idea: attempt.idea ?? "", vizSpec },
  };
}
export type SharedAttempt = NonNullable<Awaited<ReturnType<typeof loadSharedAttempt>>>;

export async function loadSharedSolution(token: string) {
  const share = await findShare("solution", token);
  if (!share) return null;
  const [solution, problem] = await Promise.all([
    Solution.findOne({ _id: share.targetId, userId: share.userId, status: "done" }).lean(),
    Problem.findOne({ _id: share.problemId, userId: share.userId }).lean(),
  ]);
  if (!solution || !problem) return null;
  const detail = await serializeSolution(solution);
  if (!detail.content || !detail.vizSpec) return null;
  return {
    ...ownerOf(share, problem),
    problem: publicProblem(problem),
    solution: {
      version: detail.version,
      requestKind: detail.requestKind,
      language: detail.language,
      content: detail.content,
      vizSpec: detail.vizSpec,
      model: detail.model,
    },
  };
}
export type SharedSolution = NonNullable<Awaited<ReturnType<typeof loadSharedSolution>>>;

/**
 * Copies the shared problem into the caller's account: the statement, link and tags, plus the fetched
 * page text and reference solutions so they needn't be looked up again. None of the owner's attempts,
 * solutions or chats come along; the forker starts fresh.
 */
export async function forkSharedProblem(token: string, userId: string, language: string) {
  if (!/^[\w-]{8,64}$/.test(token)) throw new ApiError(404, "not_found", "This link isn't shared anymore.");
  await connectDB();
  const share = await Share.findOne({ token }).lean();
  const source = share ? await Problem.findOne({ _id: share.problemId, userId: share.userId }).lean() : null;
  if (!source) throw new ApiError(404, "not_found", "This link isn't shared anymore.");
  return createProblem({
    userId: new Types.ObjectId(userId),
    title: source.title,
    statement: source.statement,
    sourceUrl: source.sourceUrl ?? undefined,
    sourceText: source.sourceText ?? undefined,
    sourceFetchedAt: source.sourceFetchedAt ?? undefined,
    references: source.references,
    tags: source.tags,
    tagsSource: source.tagsSource,
    language,
  });
}
