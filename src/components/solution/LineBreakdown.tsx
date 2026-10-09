"use client";

import { PlayIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { CodeLine } from "@/components/viz/CodePane";
import { useHighlightedLines } from "@/hooks/use-highlighted-lines";
import type { SolutionContent } from "@/lib/ai/schemas/solution";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";

/**
 * The solution one line at a time: each explained line with its note, and a
 * jump to the first step of the walkthrough where it runs.
 */
export function LineBreakdown({
  content,
  language,
  spec,
  activeLine,
  onJumpToStep,
}: {
  content: SolutionContent;
  language: string;
  spec: VizSpec;
  activeLine: number | null;
  onJumpToStep: (index: number) => void;
}) {
  const notes = new Map(content.lineNotes.map((n) => [n.line, n.note]));
  const firstStep = new Map<number, number>();
  spec.steps.forEach((s, i) => {
    if (s.line !== null && !firstStep.has(s.line)) firstStep.set(s.line, i);
  });
  const runs = (i: number) => spec.steps.filter((s) => s.line === i).length;
  const tokens = useHighlightedLines(content.codeLines, language);

  return (
    <ol className="flex flex-col rounded-lg border bg-tile" aria-label="Line by line">
      {content.codeLines.map((line, i) => {
        const note = notes.get(i);
        const step = firstStep.get(i);
        const count = runs(i);
        return (
          <li
            key={i}
            className={cn(
              "border-l-2 border-transparent px-3 py-2 not-last:border-b not-last:border-b-border",
              i === activeLine && "border-l-viz-active bg-viz-active/10",
              !note && "py-0.5",
            )}
          >
            <div className="flex items-baseline gap-2 font-mono text-[13px] leading-6">
              <span className="w-6 shrink-0 text-right text-muted-foreground/70 select-none tabular-nums">{i + 1}</span>
              <span className={cn("min-w-0 flex-1 overflow-x-auto whitespace-pre", !note && "opacity-70")}>
                <CodeLine line={line} tokens={tokens?.[i]} />
              </span>
            </div>
            {note && (
              <div className="mt-1 flex flex-wrap items-start gap-x-3 gap-y-1 pl-8">
                <p className="min-w-0 flex-1 basis-60 text-sm text-muted-foreground">{note}</p>
                {step !== undefined && (
                  <Button variant="ghost" size="xs" className="shrink-0" onClick={() => onJumpToStep(step)}>
                    <PlayIcon /> See it run{count > 1 ? ` (${count}×)` : ""}
                  </Button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
