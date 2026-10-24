import "server-only";
import { APICallError, NoObjectGeneratedError, Output, RetryError, generateText, type LanguageModel } from "ai";
import type { z } from "zod";
import { toFriendlyProviderError } from "@/lib/ai/errors";

export type Usage = { inputTokens: number; outputTokens: number; totalTokens: number };

/** One model call: `tries` counts the validation retries, `ok` is false when it threw. */
export type CallStat = { name: string; ms: number; tries: number; ok: boolean };

/**
 * Where a run's time went: every model call, the stages (from `stage()` to the next one or `report()`),
 * and notes on the paths it took (a rejected program, a case simulated instead of run).
 */
export type RunStats = {
  totalMs: number;
  stages: { name: string; ms: number }[];
  calls: CallStat[];
  notes: string[];
};

export class UsageMeter {
  private total: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  private started = Date.now();
  private calls: CallStat[] = [];
  private marks: { name: string; at: number }[] = [];
  private notes: string[] = [];

  add(u: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | undefined) {
    if (!u) return;
    this.total.inputTokens += u.inputTokens ?? 0;
    this.total.outputTokens += u.outputTokens ?? 0;
    this.total.totalTokens += u.totalTokens ?? (u.inputTokens ?? 0) + (u.outputTokens ?? 0);
  }
  snapshot(): Usage {
    return { ...this.total };
  }

  call(stat: CallStat) {
    this.calls.push(stat);
  }
  stage(name: string) {
    this.marks.push({ name, at: Date.now() });
  }
  note(text: string) {
    this.notes.push(text.length > 500 ? `${text.slice(0, 497)}...` : text);
  }

  report(): RunStats {
    const now = Date.now();
    return {
      totalMs: now - this.started,
      stages: this.marks.map((m, i) => ({ name: m.name, ms: (this.marks[i + 1]?.at ?? now) - m.at })),
      calls: [...this.calls],
      notes: [...this.notes],
    };
  }
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

/** One log line for a finished or failed run. */
export function formatRunStats(label: string, s: RunStats): string {
  const stages = s.stages.map((x) => `${x.name} ${secs(x.ms)}`).join(", ");
  const calls = s.calls
    .map((c) => `${c.name} ${secs(c.ms)}${c.tries > 1 ? ` (${c.tries} tries)` : ""}${c.ok ? "" : " FAILED"}`)
    .join(", ");
  return [
    `${label} in ${secs(s.totalMs)}`,
    stages && `  stages: ${stages}`,
    calls && `  calls: ${calls}`,
    ...s.notes.map((n) => `  note: ${n}`),
  ]
    .filter(Boolean)
    .join("\n");
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

/** The learner stopped the run. Its runner discards it instead of storing an error. */
export class RunCancelledError extends PipelineError {
  constructor() {
    super("cancelled", "Stopped.");
  }
}

/** Throws once the run's signal has fired; called between stages so a cancel lands before the next model call. */
export function throwIfCancelled(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new RunCancelledError();
}

/**
 * Settles with `work`, or rejects with `RunCancelledError` the moment the signal fires, so a stop doesn't
 * wait for work that can't be interrupted (page fetches, searches). The work itself runs on unobserved.
 */
export function abortable<T>(work: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
  if (!signal) return work;
  work.catch(() => {});
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new RunCancelledError());
    const onAbort = () => reject(new RunCancelledError());
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", onAbort));
  });
}

const CALL_TIMEOUT_MS = 180_000;
/** Plan: retry up to 2 times with the validation error appended. */
const MAX_FIX_RETRIES = 2;

type Check<T, R> = (value: T) => { ok: true; value: R } | { ok: false; issues: string };

function isProviderFailure(err: unknown) {
  return APICallError.isInstance(err) || RetryError.isInstance(err);
}

/** OpenAI rejects schema names outside ^[a-zA-Z0-9_-]+$ with a 400. */
function schemaName(name: string) {
  return name.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

/** True when the provider refused the requested output-token limit as too high for the model. */
function isOutputLimitRejected(err: unknown) {
  const e = RetryError.isInstance(err) ? err.lastError : err;
  if (!APICallError.isInstance(e) || e.statusCode !== 400) return false;
  const body = (e.responseBody ?? "").toLowerCase();
  return /max_(output_|completion_)?tokens/.test(body);
}

type StructuredOpts<S extends z.ZodType, R> = {
  model: LanguageModel;
  instructions: string;
  prompt: string;
  schema: S;
  name: string;
  meter: UsageMeter;
  check?: Check<z.infer<S>, R>;
  maxOutputTokens?: number;
  /** Per-call timeout; defaults to the long pipeline timeout. */
  timeoutMs?: number;
  /** Images sent alongside the prompt (vision calls). */
  images?: { data: Uint8Array; mediaType: string }[];
  /** Aborts the call when the learner stops the run. */
  signal?: AbortSignal;
};

/**
 * Structured output with validation-driven retries. `check` adds rules the
 * schema can't express; its issues are fed back to the model verbatim.
 * Every call is recorded on the meter, with its time and number of tries.
 */
export async function generateStructured<S extends z.ZodType, R = z.infer<S>>(opts: StructuredOpts<S, R>): Promise<R> {
  const started = Date.now();
  let tries = 0;
  let ok = false;
  try {
    const value = await generateWithRetries(opts, () => tries++);
    ok = true;
    return value;
  } finally {
    opts.meter.call({ name: opts.name, ms: Date.now() - started, tries, ok });
  }
}

async function generateWithRetries<S extends z.ZodType, R>(
  opts: StructuredOpts<S, R>,
  onTry: () => void,
): Promise<R> {
  let feedback = "";
  let maxOutputTokens = opts.maxOutputTokens;
  for (let attempt = 0; attempt <= MAX_FIX_RETRIES; attempt++) {
    const prompt = feedback
      ? `${opts.prompt}\n\n<previous_attempt_problems>\nYour previous answer was rejected:\n${feedback}\nFix every problem listed and answer again in full.\n</previous_attempt_problems>`
      : opts.prompt;
    throwIfCancelled(opts.signal);
    onTry();
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
        output: Output.object({ schema: opts.schema, name: schemaName(opts.name) }),
        maxOutputTokens,
        maxRetries: 1,
        abortSignal: AbortSignal.any(
          [AbortSignal.timeout(opts.timeoutMs ?? CALL_TIMEOUT_MS), opts.signal].filter((s) => s !== undefined),
        ),
      });
      opts.meter.add(result.usage);
      const value = result.output as z.infer<S>;
      if (!opts.check) return value as unknown as R;
      const checked = opts.check(value);
      if (checked.ok) return checked.value;
      feedback = checked.issues;
    } catch (err) {
      throwIfCancelled(opts.signal);
      if (NoObjectGeneratedError.isInstance(err)) {
        opts.meter.add(err.usage);
        const cause = err.cause instanceof Error ? err.cause.message : String(err.cause ?? "unparseable output");
        feedback = `The output did not match the required JSON schema: ${cause.slice(0, 1500)}`;
        continue;
      }
      // Smaller models (e.g. gpt-4o caps at 16k) reject our larger limits; fall back to the model's own maximum.
      if (maxOutputTokens !== undefined && isOutputLimitRejected(err)) {
        maxOutputTokens = undefined;
        attempt--;
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
