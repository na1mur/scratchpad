"use client";

import { BugIcon, TriangleAlertIcon } from "lucide-react";
import { cn } from "cn";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Button } from "@/components/ui/button";
import { stepRefs, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { CaseResultIcon } from "./CaseBar";

export function DiagnosisPanel({
  spec,
  onJumpToStep,
}: {
  spec: VizSpec;
  onJumpToStep: (caseIndex: number, stepIndex: number) => void;
}) {
  const { summary, diagnosis } = spec;
  const refs = stepRefs(spec);
  const bugSteps = diagnosis.bugStepIds.flatMap((id) => refs.get(id) ?? []);
  const many = spec.cases.length > 1;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Verdict</h3>
          <VerdictBadge verdict={summary.verdict} />
        </div>
        <p className="text-sm text-muted-foreground">{summary.understoodApproach}</p>
      </div>

      <section className="flex flex-col gap-1.5">
        {many && <h3 className="font-medium">Test cases</h3>}
        <ul className="flex flex-col gap-2">
          {spec.cases.map((c, i) => (
            <li key={c.id} className="rounded-lg border bg-tile p-3 text-sm">
              {many && (
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground tabular-nums">{i + 1}</span>
                  <span className="font-medium">{c.label}</span>
                  <CaseResultIcon passed={c.passed} />
                  <Button variant="link" size="sm" className="ml-auto h-auto p-0" onClick={() => onJumpToStep(i, 0)}>
                    Watch it run
                  </Button>
                </div>
              )}
              <dl className="grid gap-x-3 gap-y-1 sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Input</dt>
                <dd className="font-mono break-words">{c.input}</dd>
                <dt className="text-muted-foreground">Expected</dt>
                <dd className="font-mono break-words">{c.expectedOutput}</dd>
                <dt className="text-muted-foreground">Your approach gives</dt>
                <dd
                  className={cn(
                    "font-mono break-words",
                    c.passed === true && "text-viz-success",
                    c.passed === false && "text-viz-error",
                    c.passed === undefined && (summary.verdict === "works" ? "text-viz-success" : "text-viz-error"),
                  )}
                >
                  {c.actualOutput}
                </dd>
              </dl>
            </li>
          ))}
        </ul>
      </section>

      {diagnosis.whatGoesWrong && (
        <section className="flex flex-col gap-1.5 rounded-lg border border-l-4 border-l-pen-red bg-tile p-3">
          <h3 className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-4 text-viz-error" /> What goes wrong
          </h3>
          <p className="text-sm">{diagnosis.whatGoesWrong}</p>
        </section>
      )}
      {diagnosis.whyItGoesWrong && (
        <section className="flex flex-col gap-1.5 rounded-lg border bg-tile p-3">
          <h3 className="font-medium">Why</h3>
          <p className="text-sm">{diagnosis.whyItGoesWrong}</p>
        </section>
      )}

      {bugSteps.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">See it happen</h3>
          <div className="flex flex-col items-start gap-1">
            {bugSteps.map((b) => (
              <Button
                key={b.id}
                variant="link"
                className="h-auto p-0 text-left text-viz-error"
                onClick={() => onJumpToStep(b.caseIndex, b.index)}
              >
                <BugIcon /> Step {b.label}: {b.title}
              </Button>
            ))}
          </div>
        </section>
      )}

      {diagnosis.failingInputs && diagnosis.failingInputs.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">Other inputs that break it</h3>
          <ul className="flex flex-col gap-1">
            {diagnosis.failingInputs.map((f) => (
              <li key={f} className="rounded bg-muted px-2 py-1 font-mono text-xs">
                {f}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
