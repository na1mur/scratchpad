"use client";

import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { api } from "@/lib/fetcher";
import { answerText, type CompareMode, type HarnessView } from "@/lib/harness/types";
import type { ProblemDetail } from "@/lib/problems";
import { providedCode } from "@/lib/runner/entry";
import { isRunLanguage } from "@/lib/runner/protocol";

const POLL_MS = 5_000;
// A build takes a model call or two; past this, stop asking and let a reload pick it up.
const POLL_FOR_MS = 4 * 60_000;

const COMPARE_NOTES: Partial<Record<CompareMode, string>> = {
  unordered: "Answers may come in any order.",
  unordered_nested: "Answers may come in any order, inside each group too.",
  float: "Numbers are compared to within 1e-5.",
  any_valid: "Other correct answers count too.",
};

/**
 * The problem's fixed test cases, which every attempt runs on. While they're being prepared (just after
 * creating or editing the problem, or on first visiting an older one), polls until they're ready.
 */
export function TestCases({ problemId, initial, language }: { problemId: string; initial: HarnessView; language: string }) {
  const [harness, setHarness] = useState(initial);
  // A fresh server render (e.g. after editing the problem) replaces what polling found.
  const [shown, setShown] = useState(initial);
  if (initial !== shown) {
    setShown(initial);
    setHarness(initial);
  }
  // Polling stopped without a result (e.g. no API key to build with): show nothing rather than spin forever.
  const [gaveUp, setGaveUp] = useState(false);
  const pending = !gaveUp && (harness.status === "building" || harness.status === "none");

  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    let stopped = false;
    const timer = setInterval(async () => {
      if (Date.now() - started > POLL_FOR_MS) {
        clearInterval(timer);
        if (!stopped) setGaveUp(true);
        return;
      }
      try {
        const { problem } = await api<{ problem: ProblemDetail }>(`/api/problems/${problemId}`);
        if (!stopped) setHarness(problem.harness);
      } catch {}
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [pending, problemId]);

  if (pending) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden />
        Preparing test cases…
      </p>
    );
  }
  if (harness.status !== "ready") return null;

  const note = COMPARE_NOTES[harness.compare];
  // The name the tests call, so the learner can use it from the start.
  const signature = isRunLanguage(language)
    ? providedCode(language, harness).signature
    : `${harness.functionName}(${harness.params.map((p) => `${p.name}: ${p.type}`).join(", ")}) -> ${harness.returnType}`;
  return (
    <section aria-labelledby="test-cases-heading">
      <h2 id="test-cases-heading" className="text-sm font-medium">
        Test cases
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Every attempt runs on these.{note ? ` ${note}` : ""}
      </p>
      <p className="mt-1.5 text-xs">
        <span className="text-muted-foreground">They call </span>
        <code className="font-mono break-all">{signature}</code>
      </p>
      <ol className="mt-2 flex flex-col gap-2">
        {harness.cases.map((c, i) => (
          <li key={i} className="rounded-lg border bg-tile px-3 py-2 text-sm">
            <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
            <p className="mt-1 font-mono text-xs break-all">{c.input}</p>
            <p className="mt-0.5 font-mono text-xs break-all">
              <span className="text-muted-foreground">expected </span>
              {answerText(harness, c.expected)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}
