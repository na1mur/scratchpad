import { NextResponse, type NextRequest } from "next/server";
import { isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { toFriendlyProviderError } from "@/lib/ai/errors";
import { PipelineError, UsageMeter } from "@/lib/ai/pipeline/llm";
import { describeSteps } from "@/lib/ai/pipeline/steps";
import { SOLUTION_CHAT_ROLE, solutionInstructions } from "@/lib/ai/prompts/solution";
import { getModel } from "@/lib/ai/providers";
import type { SolutionContent } from "@/lib/ai/schemas/solution";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { serializeMessage, type ChatEvent } from "@/lib/messages";
import { rateLimits } from "@/lib/rateLimit";
import { sendMessageSchema } from "@/lib/schemas/messages";
import { getOwnedSolution } from "@/lib/solutions";
import { loadSpec } from "@/lib/specStorage";
import { loadUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";
import { Message } from "@/models/Message";
import { Problem } from "@/models/Problem";
import { Solution } from "@/models/Solution";

export const maxDuration = 120;

const HISTORY_LIMIT = 10;

export function GET(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/messages">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const solution = await getOwnedSolution(session.userId, id);
    const messages = await Message.find({ solutionId: solution._id, userId: session.userId }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ messages: messages.map(serializeMessage) });
  });
}

function solutionContext(c: SolutionContent, spec: VizSpec): string {
  return [
    `<solution>`,
    `approach: ${c.name}`,
    `summary: ${c.summary}`,
    `key ideas: ${c.keyIdeas.join(" | ")}`,
    `why it works: ${c.whyItWorks}`,
    `complexity: time ${c.complexity.time}, space ${c.complexity.space}. ${c.complexity.explanation}`,
    `code (1-based line numbers):`,
    c.codeLines.map((l, i) => `${i + 1}: ${l}`).join("\n"),
    `</solution>`,
    `<visualization>`,
    `test input: ${spec.summary.testInputDescription}`,
    `returns: ${spec.summary.actualOutput}`,
    `</visualization>`,
    `<trace step="id = step number">`,
    describeSteps(spec.steps, spec.codeLines, 12_000),
    `</trace>`,
  ].join("\n");
}

/**
 * Answers a question about a solution as a stream of SSE events. Unlike the
 * attempt chat there's no no-solution guardrail: the learner chose to see it.
 * The model may propose a new solution variant, which the learner confirms.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/messages">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const input = await parseJson(req, sendMessageSchema);
    const solution = await getOwnedSolution(session.userId, id);
    if (solution.status !== "done") throw new ApiError(409, "not_ready", "Wait for the solution to finish first.");
    const limit = await rateLimits.messages().consume(session.userId);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `You've hit the hourly limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
    }

    const [user, problem, spec, attempt, others] = await Promise.all([
      loadUser(session),
      Problem.findOne({ _id: solution.problemId, userId: session.userId }).lean(),
      loadSpec(solution),
      solution.basedOnAttemptId
        ? Attempt.findOne({ _id: solution.basedOnAttemptId, userId: session.userId }).select({ pseudoCode: 1, version: 1 }).lean()
        : null,
      Solution.find({ problemId: solution.problemId, userId: session.userId, status: "done", _id: { $ne: solution._id } })
        .select({ version: 1, "content.name": 1, "content.complexity": 1 })
        .lean(),
    ]);
    const content = solution.content as SolutionContent | undefined;
    if (!problem) throw new ApiError(404, "not_found", "Problem not found.");
    if (!spec || !content) throw new ApiError(409, "not_ready", "This solution has no walkthrough yet.");
    const { model } = getModel(user, "reasoning");

    const focusIds = input.focusStepIds.filter((sid) => spec.steps.some((s) => s.id === sid));
    const focused = spec.steps.filter((s) => focusIds.includes(s.id));
    const focusBlock = focused.length
      ? `\n\n<focused_steps>\n${focused
          .map((s) => {
            const n = spec.steps.indexOf(s) + 1;
            const states = JSON.stringify(s.states, (k, v) => (k === "ids" ? undefined : v));
            return `step ${n} (${s.id}), line ${s.line === null ? "-" : s.line + 1}: ${s.title}\n${s.explanation}\nstate: ${states.slice(0, 1500)}`;
          })
          .join("\n\n")}\n</focused_steps>`
      : "";

    const history = await Message.find({ solutionId: solution._id, userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean();
    const userMessage = await Message.create({
      solutionId: solution._id,
      userId: session.userId,
      role: "user",
      content: input.content,
      ...(focusIds.length && { focusStepIds: focusIds }),
    });

    const instructions = [
      solutionInstructions(problem.language, SOLUTION_CHAT_ROLE),
      `<problem>\n${problem.statement}\n</problem>`,
      attempt ? `<their_attempt version="${attempt.version}">\n<pseudocode>\n${attempt.pseudoCode}\n</pseudocode>\n</their_attempt>` : "",
      others.length
        ? `<other_solutions>\n${others
            .map((o) => {
              const c = o.content as Partial<SolutionContent> | undefined;
              return `v${o.version}: ${c?.name ?? "?"} (time ${c?.complexity?.time ?? "?"}, space ${c?.complexity?.space ?? "?"})`;
            })
            .join("\n")}\n</other_solutions>`
        : "",
      solutionContext(content, spec),
    ]
      .filter(Boolean)
      .join("\n\n");
    const messages: ModelMessage[] = [
      ...history.reverse().map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: `${input.content}${focusBlock}` },
    ];
    const meter = new UsageMeter();

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let open = true;
        const send = (e: ChatEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          } catch {
            open = false;
          }
        };
        const close = () => {
          if (!open) return;
          open = false;
          try {
            controller.close();
          } catch {}
        };

        send({ type: "user", message: serializeMessage(userMessage.toObject()) });

        void (async () => {
          let proposed = false;
          try {
            const result = streamText({
              model,
              instructions,
              messages,
              maxRetries: 1,
              abortSignal: AbortSignal.timeout(110_000),
              stopWhen: isStepCount(2),
              tools: {
                proposeSolution: tool({
                  description:
                    "Offer the learner a new solution with its own walkthrough: another approach, a better time or space complexity, or a variation they describe. They confirm before it's generated.",
                  inputSchema: z.object({
                    kind: z.enum(["different_approach", "better_time", "better_space", "custom"]),
                    note: z.string().describe("What the new solution should be, in a short phrase, e.g. 'O(n) with a hash map'."),
                  }),
                  execute: async ({ kind, note }) => {
                    if (proposed) return { error: "Already proposed one for this question." };
                    proposed = true;
                    send({ type: "proposal", kind, note: note.slice(0, 500) });
                    return { proposed: true };
                  },
                }),
              },
            });

            let text = "";
            for await (const part of result.stream) {
              if (part.type === "text-delta") {
                text += part.text;
                send({ type: "delta", text: part.text });
              } else if (part.type === "error") {
                throw part.error;
              }
            }
            meter.add(await result.usage);
            if (!text.trim()) text = proposed ? "I've suggested a new solution below." : "Sorry, I couldn't come up with an answer.";

            const saved = await Message.create({
              solutionId: solution._id,
              userId: session.userId,
              role: "assistant",
              content: text.slice(0, 20_000),
            });
            const usage = meter.snapshot();
            await Solution.updateOne(
              { _id: solution._id },
              {
                $inc: {
                  "tokenUsage.inputTokens": usage.inputTokens,
                  "tokenUsage.outputTokens": usage.outputTokens,
                  "tokenUsage.totalTokens": usage.totalTokens,
                },
              },
            );
            send({ type: "done", message: serializeMessage(saved.toObject()) });
          } catch (err) {
            const friendly =
              err instanceof ApiError || err instanceof PipelineError ? err : toFriendlyProviderError(err);
            if (!(err instanceof ApiError || err instanceof PipelineError)) {
              console.error("[solution messages] answer failed:", err instanceof Error ? err.message : err);
            }
            await Message.deleteOne({ _id: userMessage._id }).catch(() => {});
            send({ type: "error", message: friendly.message, discardedMessageId: String(userMessage._id) });
          } finally {
            close();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  });
}
