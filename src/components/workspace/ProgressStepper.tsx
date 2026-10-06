"use client";

import { CheckIcon, Loader2Icon } from "lucide-react";
import { cn } from "cn";
import type { AttemptStatus } from "@/models/Attempt";

const STAGES: { status: AttemptStatus; label: string; detail: string }[] = [
  { status: "understanding", label: "Understanding your approach", detail: "Reading your pseudo-code and picking a test input" },
  { status: "tracing", label: "Running it step by step", detail: "Executing your logic in a sandbox and recording each step" },
  { status: "diagnosing", label: "Finding where it breaks", detail: "Comparing what happens with what should happen" },
];

export function ProgressStepper({ status }: { status: AttemptStatus }) {
  const order: AttemptStatus[] = ["queued", "extracting", "understanding", "tracing", "diagnosing", "done"];
  const at = order.indexOf(status);
  return (
    <ol className="flex flex-col gap-4" aria-label="Progress">
      {STAGES.map((stage) => {
        const idx = order.indexOf(stage.status);
        const state = at > idx ? "done" : at === idx ? "active" : "pending";
        return (
          <li key={stage.status} className="flex gap-3">
            <span
              className={cn(
                "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs",
                state === "done" && "border-viz-success bg-viz-success text-white",
                state === "active" && "border-primary",
                state === "pending" && "text-muted-foreground",
              )}
            >
              {state === "done" ? (
                <CheckIcon className="size-3.5" />
              ) : state === "active" ? (
                <Loader2Icon className="size-3.5 animate-spin" />
              ) : null}
            </span>
            <div>
              <p className={cn("text-sm font-medium", state === "pending" && "text-muted-foreground")}>{stage.label}</p>
              <p className="text-xs text-muted-foreground">{stage.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
