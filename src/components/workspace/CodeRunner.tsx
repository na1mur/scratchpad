"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  CheckIcon,
  CircleIcon,
  ClockIcon,
  FootprintsIcon,
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  SquareIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";
import { cn } from "cn";
import { Player } from "@/components/viz/Player";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { sameAnswer, type HarnessView } from "@/lib/harness/types";
import { languageLabel } from "@/lib/languages";
import { providedCode } from "@/lib/runner/entry";
import type { CaseResult, RunLanguage } from "@/lib/runner/protocol";
import { runCode, type RunState } from "@/lib/runner/run";
import { runCaseSpec } from "@/lib/runner/viz";

const CodeMirrorEditor = dynamic(() => import("./CodeMirrorEditor").then((m) => m.CodeMirrorEditor), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-tile" />,
});

type ReadyView = Extract<HarnessView, { status: "ready" }>;

// Drafts outlive the dialog for the session (closing it by accident shouldn't lose edits); nothing is saved.
const drafts = new Map<string, string>();

type Verdict = "pass" | "fail" | "unknown" | "error" | "timeout" | "skipped";

function verdictOf(view: ReadyView, i: number, r: CaseResult): Verdict {
  if (r.status === "skipped") return "skipped";
  if (r.status === "timeout") return "timeout";
  if (r.status !== "ok" || r.actualJson === undefined) return "error";
  try {
    const same = sameAnswer(view.compare, JSON.parse(r.actualJson), JSON.parse(view.cases[i].expected));
    return same === null ? "unknown" : same ? "pass" : "fail";
  } catch {
    return "fail";
  }
}

function VerdictIcon({ verdict, running }: { verdict: Verdict | null; running: boolean }) {
  const cls = "size-4 shrink-0";
  if (running) return <Loader2Icon className={cn(cls, "animate-spin text-brand-strong motion-reduce:animate-none")} aria-label="Running" />;
  switch (verdict) {
    case "pass":
      return <CheckIcon className={cn(cls, "text-viz-success")} aria-label="Passed" />;
    case "fail":
      return <XIcon className={cn(cls, "text-viz-error")} aria-label="Wrong answer" />;
    case "error":
      return <TriangleAlertIcon className={cn(cls, "text-viz-error")} aria-label="Error" />;
    case "timeout":
      return <ClockIcon className={cn(cls, "text-viz-error")} aria-label="Timed out" />;
    case "unknown":
      return <CircleIcon className={cn(cls, "text-muted-foreground")} aria-label="Ran" />;
    default:
      return <CircleIcon className={cn(cls, "text-muted-foreground/50")} aria-label="Not run" />;
  }
}

/**
 * Edit & Run: the learner edits code (the attempt's completed code, or their draft) and runs it on the
 * problem's fixed test cases, in their own browser: JavaScript and TypeScript in a worker, Python through
 * Pyodide. It costs no tokens and nothing is saved. With "Show steps" each case can be stepped through in
 * the same player as an analysis, built from the run itself.
 */
export function CodeRunner({
  open,
  onOpenChange,
  draftKey,
  initialCode,
  language,
  view,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which draft this is (an attempt, or a new one), so reopening keeps the edits. */
  draftKey: string;
  initialCode: string;
  language: RunLanguage;
  view: ReadyView;
}) {
  const [code, setCode] = useState(() => drafts.get(draftKey) ?? initialCode);
  const [trace, setTrace] = useState(false);
  const [run, setRun] = useState<(RunState & { code: string; traced: boolean }) | null>(null);
  const [shownCase, setShownCase] = useState<number | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const stopRef = useRef<(() => void) | null>(null);
  const running = Boolean(run && run.phase !== "done");
  const provided = providedCode(language, view);

  // Another attempt opened in the same dialog: start from its code.
  const [key, setKey] = useState(draftKey);
  if (key !== draftKey) {
    setKey(draftKey);
    setCode(drafts.get(draftKey) ?? initialCode);
    setRun(null);
    setShownCase(null);
  }

  useEffect(() => () => stopRef.current?.(), []);

  const edit = (next: string) => {
    setCode(next);
    drafts.set(draftKey, next);
  };

  const start = () => {
    if (running || !code.trim()) return;
    const snapshot = code;
    setShownCase(null);
    const handle = runCode({
      language,
      code: snapshot,
      view,
      trace,
      onUpdate: (s) => setRun({ ...s, code: snapshot, traced: trace }),
    });
    stopRef.current = handle.stop;
    void handle.done.finally(() => {
      if (stopRef.current === handle.stop) stopRef.current = null;
    });
  };

  const verdicts = run ? run.results.map((r, i) => (r ? verdictOf(view, i, r) : null)) : [];
  const passed = verdicts.filter((v) => v === "pass").length;
  const stale = run !== null && run.phase === "done" && run.code !== code;
  const spec =
    run && shownCase !== null && run.results[shownCase]?.events
      ? runCaseSpec(run.code, run.results[shownCase]!.events!, run.loops, language)
      : null;

  let status: string;
  if (!run) status = `Runs your ${languageLabel(language)} on the ${view.cases.length} test cases, in your browser.`;
  else if (run.phase === "preparing") status = "Preparing…";
  else if (run.phase === "loading") status = "Loading Python (first run only, a few seconds)…";
  else if (run.phase === "running") status = `Running case ${(run.current ?? 0) + 1} of ${view.cases.length}…`;
  else if (run.fatal) status = "It didn't run.";
  else if (verdicts.every((v) => v === "unknown")) status = "Ran every case. Several answers can be correct here, so compare them yourself.";
  else status = `${passed} of ${view.cases.length} passed.`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92dvh] w-[calc(100%-1rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-6xl">
        <DialogHeader className="border-b px-4 py-3 pr-12">
          <DialogTitle>Edit &amp; run</DialogTitle>
          <DialogDescription>
            A scratch run in your browser: no tokens, nothing saved. Start a new attempt when you want feedback.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(14rem,45%)_1fr] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-1">
          <div className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
              <span className="text-xs font-medium text-muted-foreground">{languageLabel(language)}</span>
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs">
                  <Checkbox checked={trace} onCheckedChange={(v) => setTrace(Boolean(v))} disabled={running} />
                  Show steps
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => edit(initialCode)}
                  disabled={running || code === initialCode}
                  title="Back to the code you started from"
                >
                  <RotateCcwIcon /> Reset
                </Button>
                {running ? (
                  <Button variant="soft" size="sm" onClick={() => stopRef.current?.()}>
                    <SquareIcon /> Stop
                  </Button>
                ) : (
                  <Button variant="brand" size="sm" onClick={start} disabled={!code.trim()} title="Ctrl/⌘ + Enter">
                    <PlayIcon /> Run
                  </Button>
                )}
              </div>
            </div>
            <details className="group border-b bg-tile/60 px-3 py-1.5 text-xs">
              <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
                <span className="shrink-0 text-muted-foreground">The tests call</span>
                <code className="min-w-0 flex-1 truncate font-mono" title={provided.signature}>
                  {provided.signature}
                </code>
                {provided.definitions && (
                  <span className="shrink-0 text-muted-foreground underline-offset-2 group-open:hidden hover:underline">
                    Provided code
                  </span>
                )}
              </summary>
              {provided.definitions && (
                <>
                  <p className="mt-2 text-muted-foreground">Already defined for you, as on LeetCode (no need to write them):</p>
                  <pre className="mt-1 max-h-48 overflow-auto rounded border bg-background p-2 font-mono leading-relaxed">
                    {provided.definitions}
                  </pre>
                </>
              )}
            </details>
            <div className="min-h-0 flex-1">
              {open && (
                <CodeMirrorEditor value={code} onChange={edit} language={language} onRun={start} label={`${languageLabel(language)} code`} />
              )}
            </div>
          </div>

          <div className="flex min-h-0 flex-col overflow-y-auto p-3">
            <p className="text-sm" role="status" aria-live="polite">
              {status}
              {stale && <span className="text-muted-foreground"> (you&apos;ve edited the code since)</span>}
            </p>
            {run?.note && <p className="mt-1 text-xs text-muted-foreground">{run.note}.</p>}
            {run?.fatal && (
              <pre role="alert" className="mt-2 rounded-lg border border-viz-error/40 bg-viz-error/5 p-3 font-mono text-xs whitespace-pre-wrap text-viz-error">
                {run.fatal}
              </pre>
            )}

            <ol className="mt-3 flex flex-col gap-2">
              {view.cases.map((c, i) => {
                const r = run?.results[i] ?? null;
                const verdict = verdicts[i] ?? null;
                const canStep = Boolean(r?.events?.length) && run?.traced;
                return (
                  <li key={i} className="rounded-lg border bg-card px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <VerdictIcon verdict={verdict} running={run?.current === i && running} />
                      <span className="min-w-0 flex-1 truncate font-medium">{c.label}</span>
                      {r && r.status !== "skipped" && <span className="text-muted-foreground">{r.ms} ms</span>}
                      {canStep && (
                        <Button
                          variant={shownCase === i ? "soft" : "ghost"}
                          size="xs"
                          onClick={() => {
                            setShownCase(shownCase === i ? null : i);
                            setStepIndex(0);
                          }}
                          aria-expanded={shownCase === i}
                        >
                          <FootprintsIcon /> Steps
                        </Button>
                      )}
                    </div>
                    <p className="mt-1 font-mono break-all text-muted-foreground">{c.input}</p>
                    <p className="mt-0.5 font-mono break-all">
                      <span className="text-muted-foreground">expected </span>
                      {c.expected}
                    </p>
                    {r?.actualJson !== undefined && (
                      <p className={cn("mt-0.5 font-mono break-all", verdict === "fail" && "text-viz-error")}>
                        <span className="text-muted-foreground">got </span>
                        {r.actualJson}
                      </p>
                    )}
                    {r?.error && <p className="mt-1 font-mono break-all whitespace-pre-wrap text-viz-error">{r.error}</p>}
                    {r?.output && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-muted-foreground">Printed output</summary>
                        <pre className="mt-1 max-h-40 overflow-auto rounded bg-tile p-2 font-mono whitespace-pre-wrap">{r.output}</pre>
                      </details>
                    )}
                    {shownCase === i && spec && (
                      <div className="mt-2 border-t pt-2">
                        <Player spec={spec} language={language} index={stepIndex} onIndexChange={setStepIndex} layoutId={`run-${i}`} skipControls />
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
