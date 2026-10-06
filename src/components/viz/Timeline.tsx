"use client";

import { cn } from "cn";
import type { Step } from "@/lib/ai/schemas/vizSpec";

/**
 * One segment per step. Ticks above mark where a loop iteration starts;
 * red segments are bug moments. Ctrl/Cmd/Shift-click selects steps to ask
 * about when `onToggleSelect` is given.
 */
export function Timeline({
  steps,
  current,
  onSeek,
  bugIndexes,
  iterationStarts,
  selected,
  onToggleSelect,
}: {
  steps: Step[];
  current: number;
  onSeek: (index: number) => void;
  bugIndexes: Set<number>;
  iterationStarts: Map<number, { loopId: string; index: number }>;
  selected?: Set<string>;
  onToggleSelect?: (stepId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1" role="group" aria-label="Timeline">
      <div className="flex h-2.5 items-end gap-px">
        {steps.map((s, i) => {
          const it = iterationStarts.get(i);
          return (
            <div key={s.id} className="relative flex-1">
              {it && (
                <span
                  title={`Iteration ${it.index + 1} (${it.loopId})`}
                  className="absolute bottom-0 left-0 h-2.5 w-px bg-muted-foreground/60"
                />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex h-5 items-stretch gap-px">
        {steps.map((s, i) => {
          const bug = bugIndexes.has(i);
          const isSelected = selected?.has(s.id);
          return (
            <button
              key={s.id}
              type="button"
              aria-label={`Step ${i + 1}: ${s.title}${bug ? " (bug)" : ""}`}
              aria-current={i === current ? "step" : undefined}
              title={`${i + 1}. ${s.title}`}
              onClick={(e) => {
                if (onToggleSelect && (e.metaKey || e.ctrlKey || e.shiftKey)) onToggleSelect(s.id);
                else onSeek(i);
              }}
              className={cn(
                "min-w-0.5 flex-1 rounded-[2px] transition-colors",
                i < current && "bg-primary/35",
                i > current && "bg-muted hover:bg-muted-foreground/30",
                i === current && "bg-primary",
                bug && i !== current && "bg-viz-error/70",
                bug && i === current && "bg-viz-error",
                isSelected && "ring-2 ring-viz-active ring-offset-1 ring-offset-background",
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
