"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon, ChevronsRightIcon, RepeatIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { outlineRows } from "@/lib/viz/prepare";

/**
 * Every step of the run as a list, with each loop iteration as a collapsible
 * group that can be skipped. An iteration holding the current step opens on
 * its own; the learner's own open/close choices win over that.
 */
export function StepOutline({
  spec,
  current,
  onSeek,
}: {
  spec: VizSpec;
  current: number;
  onSeek: (index: number) => void;
}) {
  const rows = outlineRows(spec);
  const [toggled, setToggled] = useState<Map<string, boolean>>(new Map());
  const list = useRef<HTMLOListElement>(null);
  const loopLabel = (id: string) => spec.loops.find((l) => l.id === id)?.label ?? id;
  const iterationCounts = new Map<string, number>();
  for (const s of spec.steps) {
    if (s.iteration) {
      iterationCounts.set(s.iteration.loopId, Math.max(iterationCounts.get(s.iteration.loopId) ?? 0, s.iteration.index + 1));
    }
  }

  const headers = new Map(rows.flatMap((r) => (r.type === "iteration" ? [[r.key, r] as const] : [])));
  const isOpen = (key: string) => {
    const h = headers.get(key)!;
    return toggled.get(key) ?? (current >= h.start && current <= h.end);
  };
  const toggle = (key: string) => setToggled((m) => new Map(m).set(key, !isOpen(key)));

  // Keep the current step in view inside the list without scrolling the page.
  useEffect(() => {
    const box = list.current;
    const el = box?.querySelector<HTMLElement>(`[data-step="${current}"]`);
    if (!box || !el) return;
    const top = el.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top + el.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3) });
    }
  }, [current]);

  return (
    <ol ref={list} className="flex max-h-96 flex-col overflow-y-auto rounded-lg border bg-tile py-1 text-sm" aria-label="All steps">
      {rows.map((row) => {
        if (row.type === "iteration") {
          // Hidden when an enclosing iteration is collapsed.
          const enclosing = rows.find((r) => r.type === "step" && r.stepIndex === row.start);
          const parents = enclosing?.type === "step" ? enclosing.parents.filter((k) => k !== row.key) : [];
          if (parents.some((k) => !isOpen(k))) return null;
          const open = isOpen(row.key);
          const after = row.end + 1 < spec.steps.length ? row.end + 1 : null;
          const steps = row.end - row.start + 1;
          const total = iterationCounts.get(row.loopId);
          return (
            <li key={row.key} className="flex items-center gap-1 pr-2" style={{ paddingLeft: `${row.depth * 1.25 + 0.25}rem` }}>
              <button
                type="button"
                onClick={() => toggle(row.key)}
                aria-expanded={open}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-sm px-1 py-1 text-left text-xs font-medium outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50"
              >
                <ChevronRightIcon className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-90")} aria-hidden />
                <RepeatIcon className="size-3 shrink-0 text-brand-strong" aria-hidden />
                <span className="min-w-0 truncate">
                  Iteration {row.index + 1}
                  {total ? ` of ${total}` : ""} · <code className="font-mono font-normal">{loopLabel(row.loopId)}</code>
                </span>
                <span className="ml-auto shrink-0 font-normal text-muted-foreground tabular-nums">
                  {steps} step{steps === 1 ? "" : "s"}
                </span>
              </button>
              {after !== null && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => onSeek(after)}
                  aria-label={`Skip iteration ${row.index + 1}: go to step ${after + 1}`}
                  title="Skip this iteration"
                >
                  <ChevronsRightIcon /> Skip
                </Button>
              )}
            </li>
          );
        }
        if (row.parents.some((k) => !isOpen(k))) return null;
        const step = spec.steps[row.stepIndex];
        const active = row.stepIndex === current;
        return (
          <li key={step.id} data-step={row.stepIndex}>
            <button
              type="button"
              onClick={() => onSeek(row.stepIndex)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "flex w-full items-baseline gap-2 border-l-2 border-transparent py-1 pr-3 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/50",
                active && "border-viz-active bg-viz-active/15",
              )}
              style={{ paddingLeft: `${row.depth * 1.25 + 0.75}rem` }}
            >
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{row.stepIndex + 1}</span>
              <span className="min-w-0 flex-1 truncate">{step.title}</span>
              {step.line !== null && (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">line {step.line + 1}</span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
