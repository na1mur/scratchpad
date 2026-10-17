import { NextResponse, after, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { cancelRun } from "@/lib/ai/pipeline/cancel";
import { runLessonPipeline } from "@/lib/ai/pipeline/lesson";
import { noKey } from "@/lib/ai/providers";
import { LESSON_IN_PROGRESS, deleteLesson, getProblemLesson, serializeLesson } from "@/lib/lessons";
import { getOwnedProblem } from "@/lib/problems";
import { rateLimits } from "@/lib/rateLimit";
import { loadUser } from "@/lib/users";
import { Lesson } from "@/models/Lesson";

export const maxDuration = 300;

export function GET(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/lesson">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    const lesson = await getProblemLesson(session.userId, problem._id);
    return NextResponse.json({ lesson: lesson && (await serializeLesson(lesson)) });
  });
}

/**
 * Starts building the problem's lesson and returns at once; the page polls GET for progress. A lesson
 * that's done or still being built is returned as it is (one per problem), and a failed one is replaced.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/lesson">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);

    const existing = await getProblemLesson(session.userId, problem._id);
    if (existing && existing.status !== "error") {
      return NextResponse.json({ lesson: await serializeLesson(existing), existing: true });
    }

    const user = await loadUser(session);
    if (!user.ai) throw new ApiError(400, "no_provider", "Set up an AI provider in Settings first.");
    if (!user.ai.apiKey) throw noKey();
    const limit = await rateLimits.lessons().consume(session.userId);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `You've hit the hourly limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
    }
    if (existing) await deleteLesson(session.userId, existing);

    let lesson;
    try {
      lesson = await Lesson.create({
        problemId: problem._id,
        userId: session.userId,
        status: "queued",
        model: { provider: user.ai.provider, model: user.ai.model },
      });
    } catch (err) {
      // Another tab got there first: that one is the lesson.
      if ((err as { code?: number }).code !== 11000) throw err;
      await rateLimits.lessons().refund(session.userId);
      const other = await getProblemLesson(session.userId, problem._id);
      if (!other) throw err;
      return NextResponse.json({ lesson: await serializeLesson(other), existing: true });
    }
    const lessonId = String(lesson._id);

    const job = runLessonPipeline(lessonId).catch((err) => {
      void rateLimits.lessons().refund(session.userId);
      console.error("[lessons] pipeline crashed:", err instanceof Error ? err.message : err);
    });
    after(() => job);

    return NextResponse.json({ lesson: await serializeLesson(lesson.toObject()) }, { status: 201 });
  });
}

/** Stops a lesson being built, or removes a finished one so it can be built again. */
export function DELETE(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/lesson">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    const lesson = await getProblemLesson(session.userId, problem._id);
    if (!lesson) return NextResponse.json({ ok: true });

    // A live run removes its own lesson and refunds the allowance; a dead one is cleaned up here.
    const live = LESSON_IN_PROGRESS.has(lesson.status) && (await cancelRun(String(lesson._id)));
    if (LESSON_IN_PROGRESS.has(lesson.status) && !live) await rateLimits.lessons().refund(session.userId);
    // Whatever is left (a finished lesson, a dead run, or a run that ended before it noticed the stop).
    const left = await Lesson.findOne({ _id: lesson._id }).select({ specKey: 1 }).lean();
    if (left) await deleteLesson(session.userId, left);
    return NextResponse.json({ ok: true });
  });
}
