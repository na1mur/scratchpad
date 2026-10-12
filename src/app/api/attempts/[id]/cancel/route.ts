import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { cancelRun } from "@/lib/ai/pipeline/cancel";
import { emit } from "@/lib/ai/pipeline/events";
import { IN_PROGRESS, getOwnedAttempt } from "@/lib/attempts";
import { deleteAttemptCascade } from "@/lib/cascade";
import { rateLimits } from "@/lib/rateLimit";
import { Attempt } from "@/models/Attempt";

/**
 * Stops a running attempt. The runner discards it like a failed run (the form
 * keeps the learner's text and photos) and refunds the hourly allowance.
 * `stopped` is false when the run got to the end first, or when it hasn't
 * noticed the stop yet (`pending`): the stream or the poll brings the outcome.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/attempts/[id]/cancel">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const attempt = await getOwnedAttempt(session.userId, id);
    if (!IN_PROGRESS.has(attempt.status)) throw new ApiError(409, "finished", "This run has already finished.");

    if (!(await cancelRun(id))) {
      // No live run in this process (it died): clean up the way its runner would have.
      await deleteAttemptCascade(session.userId, attempt, { keepImages: true });
      await rateLimits.attempts().refund(session.userId);
      emit(id, { type: "error", code: "cancelled", message: "Stopped.", discarded: true });
    }
    const stopped = !(await Attempt.exists({ _id: attempt._id }));
    const pending = !stopped && Boolean(await Attempt.exists({ _id: attempt._id, status: { $in: [...IN_PROGRESS] } }));
    return NextResponse.json({ stopped, pending });
  });
}
