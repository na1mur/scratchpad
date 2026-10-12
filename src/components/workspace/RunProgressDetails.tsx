"use client";

import { CheckIcon, CircleIcon, Loader2Icon } from "lucide-react";
import type { ProgressCase, RunProgress } from "@/lib/runProgress";

const appear = "animate-in fade-in slide-in-from-top-1 duration-300 motion-reduce:animate-none";

function Spinner() {
  return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-brand-strong motion-reduce:animate-none" aria-hidden />;
}

const CASE_STATE: Record<ProgressCase["state"], string> = {
  pending: "Waiting",
  running: "Running",
  explaining: "Explaining each step",
  simulating: "Tracing it by hand",
  done: "Done",
};

function CaseRow({ c }: { c: ProgressCase }) {
  const busy = c.state !== "pending" && c.state !== "done";
  return (
    <li className={`flex gap-2 rounded-md border bg-card px-2.5 py-2 ${appear}`}>
      <span className="mt-0.5">
        {c.state === "done" ? (
          <CheckIcon className="size-3.5 shrink-0 text-viz-success" aria-hidden />
        ) : busy ? (
          <Spinner />
        ) : (
          <CircleIcon className="size-3.5 shrink-0 text-muted-foreground/50" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1 text-xs">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{c.label}</span>
          <span className="shrink-0 text-muted-foreground">
            {CASE_STATE[c.state]}
            {c.steps !== undefined && ` · ${c.steps} ${c.steps === 1 ? "step" : "steps"}`}
          </span>
        </p>
        <p className="truncate font-mono text-muted-foreground" title={c.description}>
          {c.description}
        </p>
        {c.actual !== undefined && (
          <p className="mt-0.5 truncate font-mono" title={`returned ${c.actual} · expected ${c.expected}`}>
            <span className="text-muted-foreground">returned</span> {c.actual}{" "}
            <span className="text-muted-foreground">· expected</span> {c.expected}
          </p>
        )}
      </div>
    </li>
  );
}

function Note({ busy, children }: { busy?: boolean; children: React.ReactNode }) {
  return (
    <p className={`flex items-center gap-1.5 text-xs text-muted-foreground ${appear}`}>
      {busy ? <Spinner /> : <CheckIcon className="size-3.5 shrink-0 text-viz-success" aria-hidden />}
      {children}
    </p>
  );
}

/** An attempt run's partial output, per stage, for `ProgressStepper`'s `details`. */
export function attemptProgressDetails(p: RunProgress | null | undefined): Partial<Record<string, React.ReactNode>> {
  if (!p) return {};
  const cases = p.cases ?? [];
  const done = cases.filter((c) => c.state === "done").length;
  return {
    understanding: p.approach && (
      <div className={`flex flex-col gap-1.5 ${appear}`}>
        <blockquote className="border-l-2 border-brand pl-2.5 text-xs text-foreground/80 italic">{p.approach}</blockquote>
        {cases.length > 0 && <Note>Picked {cases.length} test cases</Note>}
      </div>
    ),
    tracing: cases.length > 0 && (
      <div className="flex flex-col gap-2">
        {p.simulating ? (
          <Note busy={done < cases.length}>Couldn&apos;t run it directly, so it&apos;s being traced by hand</Note>
        ) : p.program?.retrying ? (
          <Note busy>The first runnable version didn&apos;t work, rebuilding it</Note>
        ) : p.program ? (
          <Note>
            Turned your code into {p.program.lines} runnable lines
            {p.program.added > 0 && ` (${p.program.added} filled in)`}
          </Note>
        ) : (
          <Note busy>Turning your pseudo-code into something runnable</Note>
        )}
        <ul className="flex flex-col gap-1.5">
          {cases.map((c) => (
            <CaseRow key={c.id} c={c} />
          ))}
        </ul>
      </div>
    ),
    diagnosing: (
      <div className="flex flex-col gap-1">
        <Note busy={!p.check}>{p.check ? "Wrote the diagnosis and hints" : "Writing the diagnosis and hints"}</Note>
        {p.check && (
          <Note busy={p.check !== "done"}>
            {p.check === "rewording"
              ? "A hint said too much, rewording it"
              : p.check === "done"
                ? "Checked the hints don't give the answer away"
                : "Checking the hints don't give the answer away"}
          </Note>
        )}
      </div>
    ),
  };
}
