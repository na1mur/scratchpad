import { NextResponse, after, type NextRequest } from "next/server";
import type { Types } from "mongoose";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { emit, subscribe, type PipelineEvent } from "@/lib/ai/pipeline/events";
import { runAttemptPipeline } from "@/lib/ai/pipeline/run";
import { noKey } from "@/lib/ai/providers";
import { serializeAttemptSummary } from "@/lib/attempts";
import { getOwnedProblem } from "@/lib/problems";
import { rateLimits } from "@/lib/rateLimit";
import { createAttemptSchema } from "@/lib/schemas/attempts";
import { loadUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";
import { Problem } from "@/models/Problem";

export const maxDuration = 300;

export function GET(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/attempts">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    const attempts = await Attempt.find({ problemId: problem._id, userId: session.userId })
      .sort({ version: -1 })
      .select({ version: 1, status: 1, createdAt: 1, "vizSpec.summary.verdict": 1 })
      .lean();
    return NextResponse.json({ attempts: attempts.map(serializeAttemptSummary) });
  });
}

/**
 * Creates an attempt and runs the pipeline, streaming progress as
 * server-sent events. The pipeline keeps going if the client disconnects;
 * a reload polls the attempt's stored status instead.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/attempts">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const input = await parseJson(req, createAttemptSchema);
    const problem = await getOwnedProblem(session.userId, id);
    const user = await loadUser(session);
    if (!user.ai) throw new ApiError(400, "no_provider", "Set up an AI provider in Settings first.");
    if (!user.ai.apiKey) throw noKey();

    const keyPrefix = `users/${session.userId}/problems/${id}/`;
    if (input.images.some((img) => !img.r2Key.startsWith(keyPrefix))) {
      throw new ApiError(400, "bad_image", "One of the images doesn't belong to this problem.");
    }

    const limit = await rateLimits.attempts().consume(session.userId);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `You've hit the hourly limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
    }

    const attempt = await createNumberedAttempt({
      problemId: problem._id,
      userId: session.userId,
      pseudoCode: input.pseudoCode,
      idea: input.idea,
      images: input.images,
      status: "queued",
      model: { provider: user.ai.provider, model: user.ai.model },
    });
    const attemptId = String(attempt._id);
    await Problem.updateOne(
      { _id: problem._id },
      { $inc: { attemptCount: 1 }, $set: { latestAttemptId: attempt._id }, $unset: { lastVerdict: 1 } },
    );

    const encoder = new TextEncoder();
    let cleanup = () => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const write = (chunk: string) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            open = false;
          }
        };
        const send = (e: PipelineEvent | { type: "attempt"; attemptId: string; version: number }) =>
          write(`data: ${JSON.stringify(e)}\n\n`);
        const heartbeat = setInterval(() => write(": ping\n\n"), 15_000);
        const unsubscribe = subscribe(attemptId, (e) => {
          send(e);
          if (e.type === "done" || e.type === "error") cleanup();
        });
        cleanup = () => {
          clearInterval(heartbeat);
          unsubscribe();
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {}
          }
        };
        send({ type: "attempt", attemptId, version: attempt.version });
      },
      cancel() {
        cleanup();
      },
    });

    // Subscribed above before the pipeline can emit anything.
    const job = runAttemptPipeline(attemptId).catch((err) => {
      void rateLimits.attempts().refund(session.userId);
      emit(attemptId, { type: "error", code: "internal", message: "Processing failed." });
      console.error("[attempts] pipeline crashed:", err instanceof Error ? err.message : err);
    });
    after(() => job);

    return new Response(stream, {
      status: 201,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}

/**
 * Numbers the attempt one past the highest existing version. Attempts can be
 * deleted, so `attemptCount` isn't a safe counter; the unique
 * (problemId, version) index settles concurrent creates, and we retry.
 */
async function createNumberedAttempt(fields: Omit<Parameters<typeof Attempt.create>[0], "version"> & { problemId: Types.ObjectId }) {
  for (let tries = 0; ; tries++) {
    const last = await Attempt.findOne({ problemId: fields.problemId }).sort({ version: -1 }).select({ version: 1 }).lean();
    try {
      return await Attempt.create({ ...fields, version: (last?.version ?? 0) + 1 });
    } catch (err) {
      if (tries < 3 && (err as { code?: number }).code === 11000) continue;
      throw err;
    }
  }
}
