"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "cn";
import type { AttemptStatus } from "@/models/Attempt";

type Stage = { status: string; label: string; detail: string };

const STAGES: Stage[] = [
  { status: "understanding", label: "Understanding your approach", detail: "Reading your pseudo-code and picking a test input" },
  { status: "tracing", label: "Running it step by step", detail: "Executing your logic in a sandbox and recording each step" },
  { status: "diagnosing", label: "Finding where it breaks", detail: "Comparing what happens with what should happen" },
];

const ORDER: AttemptStatus[] = ["queued", "extracting", "understanding", "tracing", "diagnosing", "done"];

/** Defaults to an attempt's stages; `stages` and `order` describe another pipeline (solutions). */
export function ProgressStepper({
  status,
  stages = STAGES,
  order = ORDER,
}: {
  status: string;
  stages?: Stage[];
  /** Every status in run order, including ones before the first stage and "done". */
  order?: readonly string[];
}) {
  const at = order.indexOf(status);
  const firstIdx = order.indexOf(stages[0].status);
  return (
    <ol className="flex flex-col" aria-label="Progress">
      {stages.map((stage, i) => {
        const idx = order.indexOf(stage.status);
        // Until the first stage starts (queued, extracting) the first step is shown as the one in progress,
        // so something is always visibly moving.
        const state = at > idx ? "done" : at === idx || (i === 0 && at < firstIdx) ? "active" : "pending";
        const isLast = i === stages.length - 1;
        return (
          <li key={stage.status} className="flex gap-3" aria-current={state === "active" ? "step" : undefined}>
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                  state === "done" && "border-viz-success bg-viz-success text-white",
                  state === "active" && "border-brand bg-brand-soft text-brand-strong",
                  state === "pending" && "text-muted-foreground",
                )}
              >
                {state === "done" ? (
                  <CheckIcon className="size-3.5" aria-hidden />
                ) : state === "active" ? (
                  <Loader2Icon className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                ) : null}
              </span>
              {!isLast && <span className={cn("my-1 w-px flex-1", state === "done" ? "bg-viz-success/60" : "bg-border")} />}
            </div>
            <div className={cn("pb-5", isLast && "pb-0")}>
              <p className={cn("text-sm font-medium", state === "pending" && "text-muted-foreground")}>
                {stage.label}
                <span className="sr-only">
                  {state === "done" ? " (done)" : state === "active" ? " (in progress)" : " (waiting)"}
                </span>
              </p>
              <p className="text-xs text-muted-foreground">{stage.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
