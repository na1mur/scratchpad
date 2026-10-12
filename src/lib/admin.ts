import "server-only";
import { connectDB } from "@/lib/db";
import { Attempt } from "@/models/Attempt";
import { Problem } from "@/models/Problem";
import { Solution } from "@/models/Solution";
import { User } from "@/models/User";
import type { Role } from "@/models/User";

export const ADMIN_PAGE_SIZE = 25;

export const USER_SORTS = ["joined", "active", "problems", "attempts", "solutions", "name"] as const;
export type UserSort = (typeof USER_SORTS)[number];

const SORT_FIELD: Record<UserSort, string> = {
  joined: "createdAt",
  active: "lastActiveAt",
  problems: "problems",
  attempts: "attempts",
  solutions: "solutions",
  name: "sortName",
};

export type AdminUserRow = {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  verified: boolean;
  onboarded: boolean;
  problems: number;
  attempts: number;
  solutions: number;
  tokens: number;
  joinedAt: string;
  /** The learner's latest attempt; null if they never ran one. */
  lastActiveAt: string | null;
};

export type AdminUsersPage = { rows: AdminUserRow[]; total: number };

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type Raw = {
  _id: { toString(): string };
  name?: string;
  email: string;
  role?: Role;
  emailVerified?: boolean;
  onboardingStep: string;
  createdAt: Date;
  problems: number;
  attempts: number;
  solutions: number;
  tokens: number;
  lastActiveAt?: Date | null;
};

/**
 * One page of users with their counts. The counts are `$lookup`s on the owner's id (indexed on all three
 * collections), so the list can be sorted by them.
 */
export async function listUsers(opts: {
  q: string;
  sort: UserSort;
  dir: "asc" | "desc";
  page: number;
}): Promise<AdminUsersPage> {
  await connectDB();
  const q = opts.q.trim();
  const re = q ? { $regex: escapeRegex(q), $options: "i" } : null;
  const count = (from: string, as: string) => ({
    $lookup: { from, localField: "_id", foreignField: "userId", pipeline: [{ $count: "n" }], as },
  });
  const first = (path: string) => ({ $ifNull: [{ $arrayElemAt: [path, 0] }, 0] });

  const [result] = await User.aggregate<{ rows: Raw[]; total: { n: number }[] }>([
    ...(re ? [{ $match: { $or: [{ email: re }, { name: re }] } }] : []),
    count(Problem.collection.name, "p"),
    count(Solution.collection.name, "s"),
    {
      $lookup: {
        from: Attempt.collection.name,
        localField: "_id",
        foreignField: "userId",
        pipeline: [
          {
            $group: {
              _id: null,
              n: { $sum: 1 },
              last: { $max: "$createdAt" },
              tokens: { $sum: "$tokenUsage.totalTokens" },
            },
          },
        ],
        as: "a",
      },
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        emailVerified: 1,
        onboardingStep: 1,
        createdAt: 1,
        problems: first("$p.n"),
        solutions: first("$s.n"),
        attempts: first("$a.n"),
        tokens: first("$a.tokens"),
        lastActiveAt: { $arrayElemAt: ["$a.last", 0] },
        sortName: { $toLower: { $ifNull: ["$name", "$email"] } },
      },
    },
    { $sort: { [SORT_FIELD[opts.sort]]: opts.dir === "asc" ? 1 : -1, _id: 1 } },
    {
      $facet: {
        rows: [{ $skip: (opts.page - 1) * ADMIN_PAGE_SIZE }, { $limit: ADMIN_PAGE_SIZE }],
        total: [{ $count: "n" }],
      },
    },
  ]);

  return {
    total: result?.total[0]?.n ?? 0,
    rows: (result?.rows ?? []).map((u) => ({
      id: u._id.toString(),
      name: u.name ?? null,
      email: u.email,
      role: u.role ?? "user",
      verified: u.emailVerified !== false,
      onboarded: u.onboardingStep === "done",
      problems: u.problems,
      attempts: u.attempts,
      solutions: u.solutions,
      tokens: u.tokens,
      joinedAt: u.createdAt.toISOString(),
      lastActiveAt: u.lastActiveAt ? u.lastActiveAt.toISOString() : null,
    })),
  };
}

export type AdminStats = {
  users: number;
  newUsers7d: number;
  verifiedUsers: number;
  admins: number;
  withProvider: number;
  active7d: number;
  problems: number;
  attempts: number;
  solutions: number;
  failedRuns: number;
  tokens: number;
};

const DAY = 24 * 60 * 60 * 1000;

export async function getStats(): Promise<AdminStats> {
  await connectDB();
  const since = new Date(Date.now() - 7 * DAY);
  const tokensOf = (model: typeof Attempt | typeof Solution) =>
    (model as typeof Attempt).aggregate<{ n: number }>([
      { $group: { _id: null, n: { $sum: "$tokenUsage.totalTokens" } } },
    ]);

  const [
    users,
    newUsers7d,
    verifiedUsers,
    admins,
    withProvider,
    activeAttemptUsers,
    activeSolutionUsers,
    problems,
    attempts,
    solutions,
    failedAttempts,
    failedSolutions,
    attemptTokens,
    solutionTokens,
  ] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ createdAt: { $gte: since } }),
    User.countDocuments({ emailVerified: { $ne: false } }),
    User.countDocuments({ role: "admin" }),
    User.countDocuments({ "ai.apiKey": { $exists: true } }),
    Attempt.distinct("userId", { createdAt: { $gte: since } }),
    Solution.distinct("userId", { createdAt: { $gte: since } }),
    Problem.estimatedDocumentCount(),
    Attempt.estimatedDocumentCount(),
    Solution.estimatedDocumentCount(),
    Attempt.countDocuments({ status: "error" }),
    Solution.countDocuments({ status: "error" }),
    tokensOf(Attempt),
    tokensOf(Solution),
  ]);

  return {
    users,
    newUsers7d,
    verifiedUsers,
    admins,
    withProvider,
    active7d: new Set([...activeAttemptUsers, ...activeSolutionUsers].map(String)).size,
    problems,
    attempts,
    solutions,
    failedRuns: failedAttempts + failedSolutions,
    tokens: (attemptTokens[0]?.n ?? 0) + (solutionTokens[0]?.n ?? 0),
  };
}
