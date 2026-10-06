import "server-only";
import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText, type LanguageModel } from "ai";
import type { z } from "zod";
import { toFriendlyProviderError } from "@/lib/ai/errors";

export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };

export class UsageMeter {
  private total: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  add(u: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined) {
    if (!u) return;
    this.total.inputTokens += u.inputTokens ?? 0;
    this.total.outputTokens += u.outputTokens ?? 0;
    this.total.totalTokens += u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
  }
  snapshot(): Usage {
    return { ...this.total };
  }
}

/** A pipeline failure with a message that is safe to show the learner. */
export class PipelineError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const CALL_TIMEOUT_MS = 180_000;
/** Plan: retry up to 2 times with the validation error appended. */
const MAX_FIX_RETRIES = 2;

type Check<T, R> = (value: T) => { ok: true; value: R } | { ok: false; issues: string };

function isProviderFailure(err: unknown) {
  return APICallError.isInstance(err) || RetryError.isInstance(err);
}

/**
 * Structured output with validation-driven retries. `check` adds rules the
 * schema can't express; its issues are fed back to the model verbatim.
 */
export async function generateStructured<S extends z.ZodType, R = z.infer<S>>(opts: {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  schema: S;
  name: string;
  meter: UsageMeter;
  check?: Check<z.infer<S>, R>;
  maxOutputTokens?: number;
  /** Images sent alongside the prompt (vision calls). */
  images?: { data: Uint8Array; mediaType: string }[];
}): Promise<R> {
  let feedback = "";
  for (let attempt = 0; attempt <= MAX_FIX_RETRIES; attempt++) {
    const prompt = feedback
      ? `${opts.prompt}\n\n<previous_attempt_problems>\nYour previous answer was rejected:\n${feedback}\nFix every problem listed and answer again in full.\n</previous_attempt_problems>`
      : opts.prompt;
    try {
      const input = opts.images?.length
        ? {
            messages: [
              {
                role: "user" as const,
                content: [
                  { type: "text" as const, text: prompt },
                  ...opts.images.map((img) => ({ type: "file" as const, mediaType: img.mediaType, data: img.data })),
                ],
              },
            ],
          }
        : { prompt };
      const result = await generateText({
        model: opts.model,
        instructions: opts.instructions,
        ...input,
        output: Output.object({ schema: opts.schema, name: opts.name }),
        maxOutputTokens: opts.maxOutputTokens,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      });
      opts.meter.add(result.usage);
      const value = result.output as z.infer<S>;
      if (!opts.check) return value as unknown as R;
      const checked = opts.check(value);
      if (checked.ok) return checked.value;
      feedback = checked.issues;
    } catch (err) {
      if (NoObjectGeneratedError.isInstance(err)) {
        opts.meter.add(err.usage);
        const cause = err.cause instanceof Error ? err.cause.message : String(err.cause ?? "unparseable output");
        feedback = `The output did not match the required JSON schema: ${cause.slice(0, 1500)}`;
        continue;
      }
      if (isProviderFailure(err)) throw toFriendlyProviderError(err);
      if (err instanceof Error && err.name === "TimeoutError") {
        throw new PipelineError("timeout", "The AI provider took too long to answer. Try again.");
      }
      throw err;
    }
  }
  throw new PipelineError(
    "invalid_output",
    `The model couldn't produce a valid ${opts.name} after ${MAX_FIX_RETRIES + 1} tries. Try again or pick a stronger model in Settings.`,
  );
}
