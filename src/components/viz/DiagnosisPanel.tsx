"use client";

import { useState } from "react";
import { BugIcon, LightbulbIcon, TriangleAlertIcon } from "lucide-react";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Button } from "@/components/ui/button";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";

export function DiagnosisPanel({ spec, onJumpToStep }: { spec: VizSpec; onJumpToStep: (index: number) => void }) {
  const { summary, diagnosis } = spec;
  const [revealed, setRevealed] = useState(0);
  const bugSteps = diagnosis.bugStepIds
    .map((id) => ({ id, index: spec.steps.findIndex((s) => s.id === id) }))
    .filter((b) => b.index >= 0);
  const works = summary.verdict === "works";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">Verdict</h3>
          <VerdictBadge verdict={summary.verdict} />
        </div>
        <p className="text-sm text-muted-foreground">{summary.understoodApproach}</p>
      </div>

      <dl className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Test input</dt>
        <dd className="font-mono">{summary.testInputDescription}</dd>
        <dt className="text-muted-foreground">Expected</dt>
        <dd className="font-mono">{summary.expectedOutput}</dd>
        <dt className="text-muted-foreground">Your approach gives</dt>
        <dd className={`font-mono ${works ? "text-viz-success" : "text-viz-error"}`}>{summary.actualOutput}</dd>
      </dl>

      {diagnosis.whatGoesWrong && (
        <section className="flex flex-col gap-1.5">
          <h3 className="flex items-center gap-1.5 font-medium">
            <TriangleAlertIcon className="size-4 text-viz-error" /> What goes wrong
          </h3>
          <p className="text-sm">{diagnosis.whatGoesWrong}</p>
        </section>
      )}
      {diagnosis.whyItGoesWrong && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">Why</h3>
          <p className="text-sm">{diagnosis.whyItGoesWrong}</p>
        </section>
      )}

      {bugSteps.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h3 className="font-medium">See it happen</h3>
          <div className="flex flex-col items-start gap-1">
            {bugSteps.map((b) => (
              <Button key={b.id} variant="link" className="h-auto p-0 text-left text-viz-error" onClick={() => onJumpToStep(b.index)}>
                <BugIcon /> Step {b.index + 1}: {spec.steps[b.index].title}
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

      {diagnosis.thinkingHints.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 font-medium">
            <LightbulbIcon className="size-4 text-viz-compare" /> Hints
          </h3>
          <ol className="flex flex-col gap-2">
            {diagnosis.thinkingHints.slice(0, revealed).map((h, i) => (
              <li key={i} className="rounded-lg border border-viz-compare/30 bg-viz-compare/10 p-3 text-sm">
                <span className="mr-1 font-medium">{i + 1}.</span>
                {h}
              </li>
            ))}
          </ol>
          {revealed < diagnosis.thinkingHints.length ? (
            <Button variant="outline" className="self-start" onClick={() => setRevealed(revealed + 1)}>
              <LightbulbIcon />
              {revealed === 0 ? "Show a hint" : "Show a more specific hint"} ({revealed + 1}/
              {diagnosis.thinkingHints.length})
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">That&apos;s every hint. The rest is yours to figure out.</p>
          )}
        </section>
      )}
    </div>
  );
}
