"use client";

import { AnimatePresence, motion } from "motion/react";
import { BugIcon, RepeatIcon } from "lucide-react";
import type { Loop, Step } from "@/lib/ai/schemas/vizSpec";

export function ExplanationPanel({
  step,
  index,
  total,
  loops,
  iterationCounts,
  isBug,
  action,
}: {
  step: Step;
  index: number;
  total: number;
  loops: Loop[];
  /** loopId -> number of distinct iterations in the whole run. */
  iterationCounts: Map<string, number>;
  isBug: boolean;
  /** Extra control shown at the end of the badge row. */
  action?: React.ReactNode;
}) {
  const loop = step.iteration ? loops.find((l) => l.id === step.iteration!.loopId) : undefined;
  return (
    <div className={`rounded-lg border p-4 ${isBug ? "border-viz-error/50 bg-viz-error/5" : "bg-card"}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-muted-foreground tabular-nums">
          Step {index + 1} of {total}
        </span>
        {step.iteration && (
          <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-0.5">
            <RepeatIcon className="size-3" />
            Iteration {step.iteration.index + 1}
            {iterationCounts.get(step.iteration.loopId) ? ` of ${iterationCounts.get(step.iteration.loopId)}` : ""} of
            loop <code className="font-mono">{loop?.label ?? step.iteration.loopId}</code>
          </span>
        )}
        {step.event && <span className="rounded-full border px-2 py-0.5 text-muted-foreground">{step.event}</span>}
        {isBug && (
          <span className="flex items-center gap-1 rounded-full bg-viz-error px-2 py-0.5 font-medium text-white">
            <BugIcon className="size-3" /> Where it goes wrong
          </span>
        )}
        {action && <span className="ml-auto">{action}</span>}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
        >
          <h3 className="font-medium">{step.title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{step.explanation}</p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
