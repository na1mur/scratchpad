import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { cancelRun } from "@/lib/ai/pipeline/cancel";
import { emit } from "@/lib/ai/pipeline/events";
import { deleteSolutionCascade } from "@/lib/cascade";
import { rateLimits } from "@/lib/rateLimit";
import { SOLUTION_IN_PROGRESS, getOwnedSolution } from "@/lib/solutions";
import { Solution } from "@/models/Solution";

/**
 * Stops a solution being written. The runner deletes it, so it takes no
 * version number, and refunds the hourly allowance. `stopped` is false when
 * the run got to the end first.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/cancel">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const solution = await getOwnedSolution(session.userId, id);
    if (!SOLUTION_IN_PROGRESS.has(solution.status)) throw new ApiError(409, "finished", "This solution has already finished.");

    if (!(await cancelRun(id))) {
      // No live run in this process (it died): clean up the way its runner would have.
      await deleteSolutionCascade(session.userId, solution);
      await rateLimits.solutions().refund(session.userId);
      emit(id, { type: "error", code: "cancelled", message: "Stopped." });
    }
    const stopped = !(await Solution.exists({ _id: solution._id }));
    return NextResponse.json({ stopped });
  });
}
