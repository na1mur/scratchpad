"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import type { TestCase, VizSpec } from "@/lib/ai/schemas/vizSpec";

/**
 * Picks which test case the walkthrough shows (hidden when there's only one) and states that case's
 * input and result. `gives` labels the result, e.g. "Your code gives" or "Returns".
 */
export function CaseBar({
  spec,
  caseIndex,
  onCaseChange,
  gives,
  trailing,
}: {
  spec: VizSpec;
  caseIndex: number;
  onCaseChange: (index: number) => void;
  gives: string;
  /** Shown at the end of the input row, e.g. the owner's usage badge. */
  trailing?: React.ReactNode;
}) {
  const current = spec.cases[Math.min(caseIndex, spec.cases.length - 1)];
  return (
    <div className="flex flex-col gap-2">
      {spec.cases.length > 1 && (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="group" aria-label="Test cases">
          {spec.cases.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={i === caseIndex}
              onClick={() => onCaseChange(i)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                i === caseIndex
                  ? "border-brand bg-brand-soft text-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <span className="text-xs tabular-nums opacity-70">{i + 1}</span>
              {c.label}
              <CaseResultIcon passed={c.passed} />
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm text-muted-foreground">
          Input: <span className="font-mono text-foreground">{current.input}</span>
          <span className="mx-1.5" aria-hidden>
            →
          </span>
          <span className="sr-only">{gives}: </span>
          <span className={cn("font-mono", resultTone(current))}>{current.actualOutput}</span>
          {current.passed === false && current.expectedOutput && (
            <span className="ml-1.5">
              (expected <span className="font-mono text-foreground">{current.expectedOutput}</span>)
            </span>
          )}
        </p>
        {trailing}
      </div>
    </div>
  );
}

export function CaseResultIcon({ passed, className }: { passed: boolean | undefined; className?: string }) {
  if (passed === undefined) return null;
  return passed ? (
    <CheckIcon className={cn("size-3.5 text-viz-success", className)} aria-label="correct" />
  ) : (
    <XIcon className={cn("size-3.5 text-viz-error", className)} aria-label="wrong" />
  );
}

function resultTone(c: TestCase) {
  if (c.passed === undefined) return "text-foreground";
  return c.passed ? "text-viz-success" : "text-viz-error";
}

/** "Passes 2 of 4 cases", or null when the cases weren't judged. */
export function casesPassedText(spec: VizSpec): string | null {
  const judged = spec.cases.filter((c) => c.passed !== undefined);
  if (spec.cases.length < 2 || judged.length === 0) return null;
  const passed = judged.filter((c) => c.passed).length;
  return passed === spec.cases.length ? `Passes all ${passed} cases` : `Passes ${passed} of ${spec.cases.length} cases`;
}
