import type { CallSpec } from "@/lib/harness/types";
import type { AutoEvent } from "@/lib/trace/steps";

/**
 * Playground: the learner's own code, run in their browser on the problem's fixed test cases. Nothing
 * here touches the server or a model. These are the messages between the page and the run's worker.
 */

export const RUN_LANGUAGES = ["python", "javascript", "typescript"] as const;
export type RunLanguage = (typeof RUN_LANGUAGES)[number];

export function isRunLanguage(language: string | null | undefined): language is RunLanguage {
  return (RUN_LANGUAGES as readonly string[]).includes(language ?? "");
}

/** How to call the learner's function: the harness's signature with its types parsed. */
export type RunCall = CallSpec;

export type CaseStatus = "ok" | "error" | "timeout" | "trace_limit" | "skipped";

export type CaseResult = {
  status: CaseStatus;
  /** What it returned (or the changed argument, for an in-place function), as harness JSON. */
  actualJson?: string;
  /** The error, with its line when known: "Line 4: TypeError: …". */
  error?: string;
  /** What it printed. */
  output: string;
  ms: number;
  /** Recorded steps, when the run was traced. */
  events?: AutoEvent[];
  /** Python: the function that ran isn't named as in the signature ("Ran your foo as bar"). */
  note?: string;
};

/** Worker → page. */
export type WorkerMessage =
  | { type: "loading" }
  | { type: "start"; i: number }
  | { type: "case"; i: number; result: CaseResult }
  | { type: "done"; loops?: { id: string; line: number }[] }
  /** The code couldn't run at all (a syntax error, a missing function, the runtime failing to load). */
  | { type: "fatal"; error: string };

/** Page → Python worker (the JS worker gets everything baked in). */
export type PythonRunMessage = {
  code: string;
  call: RunCall;
  cases: Record<string, unknown>[];
  from: number;
  trace: boolean;
};
