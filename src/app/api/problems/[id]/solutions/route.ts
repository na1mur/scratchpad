import { NextResponse, after, type NextRequest } from "next/server";
import type { Types } from "mongoose";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { runSolutionPipeline } from "@/lib/ai/pipeline/solution";
import { deleteSolutionCascade } from "@/lib/cascade";
import { getOwnedProblem } from "@/lib/problems";
import { rateLimits } from "@/lib/rateLimit";
import { createSolutionSchema } from "@/lib/schemas/solutions";
import { SOLUTION_IN_PROGRESS, SOLUTION_SUMMARY_FIELDS, getOwnedSolution, serializeSolutionSummary } from "@/lib/solutions";
import { loadUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";
import { Solution } from "@/models/Solution";

export const maxDuration = 300;

export function GET(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/solutions">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    const solutions = await Solution.find({ problemId: problem._id, userId: session.userId })
      .sort({ version: -1 })
      .select(SOLUTION_SUMMARY_FIELDS)
      .lean();
    return NextResponse.json({ solutions: solutions.map(serializeSolutionSummary) });
  });
}

/**
 * Starts writing a solution and returns at once; the page polls
 * GET /api/solutions/[id] for progress. Solutions are kept, so this only
 * runs when the learner asks for a first one or a new variant.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/solutions">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const input = await parseJson(req, createSolutionSchema);
    const problem = await getOwnedProblem(session.userId, id);
    const user = await loadUser(session);
    if (!user.ai) throw new ApiError(400, "no_provider", "Set up an AI provider in Settings first.");

    const others = await Solution.find({ problemId: problem._id, userId: session.userId })
      .select({ status: 1, updatedAt: 1, specR2Key: 1 })
      .lean();
    for (const s of others) {
      // Goes through the stale check, so a run that died with the server doesn't block new ones forever.
      if (SOLUTION_IN_PROGRESS.has(s.status) && SOLUTION_IN_PROGRESS.has((await getOwnedSolution(session.userId, String(s._id))).status)) {
        throw new ApiError(409, "in_progress", "A solution is already being written for this problem. Wait for it to finish.");
      }
    }
    if (input.kind === "initial" && others.some((s) => s.status === "done")) {
      throw new ApiError(409, "exists", "This problem already has a solution.");
    }

    const attempt = input.attemptId
      ? await Attempt.findOne({ _id: input.attemptId, problemId: problem._id, userId: session.userId, status: "done" })
          .select({ version: 1 })
          .lean()
      : input.kind === "initial"
        ? await Attempt.findOne({ problemId: problem._id, userId: session.userId, status: "done" })
            .sort({ version: -1 })
            .select({ version: 1 })
            .lean()
        : null;

    const limit = await rateLimits.solutions().consume(session.userId);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `You've hit the hourly limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
    }

    // A failed run holds nothing worth keeping; clearing it frees its version number.
    for (const s of others) {
      if (s.status === "error") await deleteSolutionCascade(session.userId, s);
    }

    const solution = await createNumberedSolution({
      problemId: problem._id,
      userId: session.userId,
      request: { kind: input.kind, note: input.note },
      ...(attempt && { basedOnAttemptId: attempt._id, basedOnAttemptVersion: attempt.version }),
      language: problem.language,
      status: "queued",
      model: { provider: user.ai.provider, model: user.ai.model },
    });
    const solutionId = String(solution._id);

    const job = runSolutionPipeline(solutionId).catch((err) => {
      void rateLimits.solutions().refund(session.userId);
      console.error("[solutions] pipeline crashed:", err instanceof Error ? err.message : err);
    });
    after(() => job);

    return NextResponse.json({ solution: serializeSolutionSummary(solution.toObject()) }, { status: 201 });
  });
}

/** Numbers the solution one past the highest existing version; see createNumberedAttempt. */
async function createNumberedSolution(fields: Omit<Parameters<typeof Solution.create>[0], "version"> & { problemId: Types.ObjectId }) {
  for (let tries = 0; ; tries++) {
    const last = await Solution.findOne({ problemId: fields.problemId }).sort({ version: -1 }).select({ version: 1 }).lean();
    try {
      return await Solution.create({ ...fields, version: (last?.version ?? 0) + 1 });
    } catch (err) {
      if (tries < 3 && (err as { code?: number }).code === 11000) continue;
      throw err;
    }
  }
}
