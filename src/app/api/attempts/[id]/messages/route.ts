import { NextResponse, type NextRequest } from "next/server";
import { generateText, isStepCount, streamText, tool, type ModelMessage } from "ai";
import { z } from "zod";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { toFriendlyProviderError } from "@/lib/ai/errors";
import { PipelineError, UsageMeter } from "@/lib/ai/pipeline/llm";
import { regenerateSpec } from "@/lib/ai/pipeline/regenerate";
import { describeSteps } from "@/lib/ai/pipeline/steps";
import { revealsSolution, type Ctx } from "@/lib/ai/pipeline/stages";
import { CHAT_ROLE, STRICT_CHAT_ADDENDUM } from "@/lib/ai/prompts/chat";
import { baseInstructions, learnerContext } from "@/lib/ai/prompts/system";
import { getModel } from "@/lib/ai/providers";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { getOwnedAttempt } from "@/lib/attempts";
import { rateLimits } from "@/lib/rateLimit";
import { sendMessageSchema } from "@/lib/schemas/messages";
import { loadSpec } from "@/lib/specStorage";
import { loadUser } from "@/lib/users";
import { serializeMessage, type ChatEvent } from "@/lib/messages";
import { Attempt } from "@/models/Attempt";
import { Message } from "@/models/Message";
import { Problem } from "@/models/Problem";

export const maxDuration = 300;

const HISTORY_LIMIT = 10;

export function GET(req: NextRequest, ctx: RouteContext<"/api/attempts/[id]/messages">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const attempt = await getOwnedAttempt(session.userId, id);
    const messages = await Message.find({ attemptId: attempt._id, userId: session.userId }).sort({ createdAt: 1 }).lean();
    return NextResponse.json({ messages: messages.map(serializeMessage) });
  });
}

function specContext(spec: VizSpec): string {
  const d = spec.diagnosis;
  return [
    `<visualization>`,
    `test input: ${spec.summary.testInputDescription}`,
    `expected: ${spec.summary.expectedOutput}`,
    `their code gives: ${spec.summary.actualOutput}`,
    `verdict: ${spec.summary.verdict}`,
    `their approach: ${spec.summary.understoodApproach}`,
    `</visualization>`,
    `<diagnosis_already_shown>`,
    `what goes wrong: ${d.whatGoesWrong || "-"}`,
    `why: ${d.whyItGoesWrong || "-"}`,
    `bug steps: ${d.bugStepIds.join(", ") || "-"}`,
    `scope: ${d.rethink?.scope ?? "-"}`,
    `broken assumption: ${d.rethink?.brokenAssumption || "-"}`,
    `different way to think about it: ${d.rethink?.shiftInThinking || "-"}`,
    `hints: ${d.thinkingHints.join(" | ") || "-"}`,
    `</diagnosis_already_shown>`,
    `<trace step="id = step number">`,
    describeSteps(spec.steps, spec.codeLines, 12_000),
    `</trace>`,
  ].join("\n");
}

/**
 * Answers a follow-up question as a stream of SSE events. The model may call
 * regenerateVisualization, which re-runs stages 2–3 and adds a spec version.
 * The finished answer goes through the no-solution guardrail and is
 * replaced (not just flagged) if it leaks the solution.
 */
export function POST(req: NextRequest, ctx: RouteContext<"/api/attempts/[id]/messages">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const input = await parseJson(req, sendMessageSchema);
    const attempt = await getOwnedAttempt(session.userId, id);
    if (attempt.status !== "done") throw new ApiError(409, "not_ready", "Wait for the visualization to finish first.");
    const limit = await rateLimits.messages().consume(session.userId);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `You've hit the hourly limit. Try again in ${Math.ceil(limit.retryAfterSeconds / 60)} min.`);
    }

    const [user, problem] = await Promise.all([
      loadUser(session),
      Problem.findOne({ _id: attempt.problemId, userId: session.userId }).lean(),
    ]);
    if (!problem) throw new ApiError(404, "not_found", "Problem not found.");
    const versions = attempt.specVersions ?? [];
    const versionIndex = input.specVersion && input.specVersion <= versions.length ? input.specVersion - 1 : versions.length - 1;
    const spec = versionIndex >= 0 ? await loadSpec(versions[versionIndex]) : await loadSpec(attempt);
    if (!spec) throw new ApiError(409, "not_ready", "This attempt has no visualization yet.");
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

    const history = await Message.find({ attemptId: attempt._id, userId: session.userId })
      .sort({ createdAt: -1 })
      .limit(HISTORY_LIMIT)
      .lean();
    const userMessage = await Message.create({
      attemptId: attempt._id,
      userId: session.userId,
      role: "user",
      content: input.content,
      ...(focusIds.length && { focusStepIds: focusIds }),
    });

    const learner = {
      statement: problem.statement,
      source: problem.sourceText ?? "",
      pseudoCode: attempt.pseudoCode,
      idea: attempt.idea ?? "",
      language: problem.language,
    };
    const instructions = `${baseInstructions(problem.language, CHAT_ROLE)}\n\n${learnerContext(learner)}\n\n${specContext(spec)}`;
    const messages: ModelMessage[] = [
      ...history.reverse().map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: `${input.content}${focusBlock}` },
    ];
    const meter = new UsageMeter();
    const guardCtx: Ctx = { model, meter, learner };

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
          let producedSpecVersion: number | undefined;
          try {
            const result = streamText({
              model,
              instructions,
              messages,
              maxRetries: 1,
              abortSignal: AbortSignal.timeout(280_000),
              stopWhen: isStepCount(3),
              tools: {
                regenerateVisualization: tool({
                  description:
                    "Re-run the trace and diagnosis of the learner's code, optionally on a new test input or focusing on specific steps. Takes up to a minute.",
                  inputSchema: z.object({
                    reason: z.string().describe("Why a new visualization helps, in a short phrase shown to the learner."),
                    focusStepIds: z.array(z.string()).optional().describe("Step ids the new trace should cover in detail."),
                    newTestInput: z.string().optional().describe("A different test input, e.g. 'nums = [3, 3], target = 6'."),
                  }),
                  execute: async ({ reason, focusStepIds, newTestInput }) => {
                    if (producedSpecVersion) return { error: "Already regenerated once for this question." };
                    send({ type: "regenerating", reason });
                    try {
                      const focusSteps = spec.steps.filter((s) => focusStepIds?.includes(s.id));
                      const regen = await regenerateSpec({
                        attempt,
                        model,
                        language: problem.language,
                        statement: problem.statement,
                        source: problem.sourceText ?? "",
                        guidance: { reason, newTestInput },
                        focusDescription: focusSteps.length
                          ? `the steps titled: ${focusSteps.map((s) => `"${s.title}"`).join(", ")}`
                          : undefined,
                      });
                      producedSpecVersion = regen.specVersion;
                      send({ type: "spec", specVersion: regen.specVersion });
                      return {
                        specVersion: regen.specVersion,
                        testInput: regen.spec.summary.testInputDescription,
                        actualOutput: regen.spec.summary.actualOutput,
                        verdict: regen.spec.summary.verdict,
                        stepCount: regen.spec.steps.length,
                        bugSteps: regen.spec.steps.filter((s) => s.isBugMoment).map((s) => s.title),
                      };
                    } catch (err) {
                      const message =
                        err instanceof PipelineError || err instanceof ApiError ? err.message : "Regeneration failed.";
                      return { error: message };
                    }
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

            if (!text.trim()) text = producedSpecVersion ? "Here's a new visualization." : "Sorry, I couldn't come up with an answer.";
            const check = await revealsSolution(guardCtx, text);
            if (check.reveals) {
              const fixed = await generateText({
                model,
                instructions: `${instructions}\n\n${STRICT_CHAT_ADDENDUM}`,
                messages: [...messages, { role: "assistant", content: text }, { role: "user", content: "Rewrite your previous answer as instructed." }],
                maxRetries: 1,
              });
              meter.add(fixed.usage);
              text = fixed.text.trim() || "Let's look at it differently: what does your code do at the highlighted step, and is that what the problem needs?";
              send({ type: "replace", text });
            }

            const saved = await Message.create({
              attemptId: attempt._id,
              userId: session.userId,
              role: "assistant",
              content: text.slice(0, 20_000),
              ...(producedSpecVersion && { producedSpecVersion }),
            });
            const usage = meter.snapshot();
            await Attempt.updateOne(
              { _id: attempt._id },
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
              console.error("[messages] answer failed:", err instanceof Error ? err.message : err);
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
