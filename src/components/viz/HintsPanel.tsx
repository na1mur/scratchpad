"use client";

import { useState } from "react";
import { BugIcon, CompassIcon, LightbulbIcon, RefreshCwIcon, WrenchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";

export function HintsPanel({ spec, onJumpToStep }: { spec: VizSpec; onJumpToStep: (index: number) => void }) {
  const { diagnosis } = spec;
  const { rethink, thinkingHints } = diagnosis;
  const [revealed, setRevealed] = useState(0);
  const firstBugIndex = diagnosis.bugStepIds.map((id) => spec.steps.findIndex((s) => s.id === id)).find((i) => i >= 0);

  if (!rethink && thinkingHints.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {spec.summary.verdict === "works" ? "Your approach works, so there's nothing to hint at." : "No hints for this run."}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {rethink && (
        <>
          {rethink.scope === "rethink-the-approach" ? (
            <div className="flex gap-2.5 rounded-lg border border-l-4 border-l-viz-error bg-tile p-3 text-sm">
              <RefreshCwIcon className="mt-0.5 size-4 shrink-0 text-viz-error" />
              <p>
                <span className="font-medium">This strategy needs rethinking.</span> Patching the details won&apos;t make it
                work, so step back before changing code.
              </p>
            </div>
          ) : (
            <div className="flex gap-2.5 rounded-lg border border-l-4 border-l-viz-success bg-tile p-3 text-sm">
              <WrenchIcon className="mt-0.5 size-4 shrink-0 text-viz-success" />
              <p>
                <span className="font-medium">You&apos;re close.</span> The core idea can work; it&apos;s the details that
                slip.
              </p>
            </div>
          )}

          <section className="flex flex-col gap-1.5 rounded-lg border bg-tile p-3">
            <h3 className="font-medium">Why the current approach doesn&apos;t work</h3>
            <p className="text-sm">{rethink.brokenAssumption}</p>
            {firstBugIndex !== undefined && (
              <Button
                variant="link"
                className="h-auto self-start p-0 text-viz-error"
                onClick={() => onJumpToStep(firstBugIndex)}
              >
                <BugIcon /> See where it breaks (step {firstBugIndex + 1})
              </Button>
            )}
          </section>

          {rethink.shiftInThinking && (
            <section className="flex flex-col gap-1.5 rounded-lg border bg-tile p-3">
              <h3 className="flex items-center gap-1.5 font-medium">
                <CompassIcon className="size-4 text-viz-active" /> A different way to look at it
              </h3>
              <p className="text-sm">{rethink.shiftInThinking}</p>
            </section>
          )}
        </>
      )}

      {thinkingHints.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-1.5 font-medium">
            <LightbulbIcon className="size-4 text-viz-compare" /> Hints
          </h3>
          <ol className="flex flex-col gap-2">
            {thinkingHints.slice(0, revealed).map((h, i) => (
              <li key={i} className="rounded-lg border bg-tile p-3 text-sm">
                <span className="mr-1 font-medium">{i + 1}.</span>
                {h}
              </li>
            ))}
          </ol>
          {revealed < thinkingHints.length ? (
            <Button variant="soft" className="self-start" onClick={() => setRevealed(revealed + 1)}>
              <LightbulbIcon />
              {revealed === 0 ? "Show a hint" : "Show a more specific hint"} ({revealed + 1}/{thinkingHints.length})
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">That&apos;s every hint. The rest is yours to figure out.</p>
          )}
        </section>
      )}
    </div>
  );
}
