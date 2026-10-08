"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  CopyPlusIcon,
  GitBranchIcon,
  LightbulbIcon,
  RotateCcwIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodePane } from "@/components/viz/CodePane";
import { Player } from "@/components/viz/Player";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { UsageBadge } from "@/components/workspace/UsageBadge";
import { useMediaQuery } from "@/hooks/use-media-query";
import { SOLUTION_REQUEST_LABELS } from "@/lib/ai/schemas/solution";
import type { SolutionEvent } from "@/lib/ai/pipeline/events";
import { ApiClientError, api, apiRaw, toApiError } from "@/lib/fetcher";
import { languageLabel } from "@/lib/languages";
import type { ProblemDetail } from "@/lib/problems";
import type { SolutionDetail, SolutionSummary } from "@/lib/solutions";
import { readSSE } from "@/lib/sse";
import type { SolutionStatus } from "@/models/Solution";
import { LineBreakdown } from "./LineBreakdown";
import { NewSolutionDialog, type SolutionRequest } from "./NewSolutionDialog";
import { StepOutline } from "./StepOutline";

const IN_PROGRESS = new Set<SolutionStatus>(["queued", "solving", "tracing", "narrating"]);

const STAGES = [
  { status: "solving", label: "Working out the solution", detail: "Writing the code and why it works" },
  { status: "tracing", label: "Running it step by step", detail: "Executing it in a sandbox on a small input" },
  { status: "narrating", label: "Explaining each step", detail: "Writing the walkthrough" },
];
const ORDER = ["queued", "solving", "tracing", "narrating", "done"];

const versionLabel = (s: SolutionSummary) =>
  `v${s.version} · ${s.name ?? (IN_PROGRESS.has(s.status) ? "being written…" : s.status === "error" ? "failed" : "…")}${
    s.time ? ` · ${s.time}` : ""
  }`;

export function SolutionView({
  problem,
  initialSolutions,
  initialSolution,
  baseAttempt,
  canGenerate,
}: {
  problem: ProblemDetail;
  initialSolutions: SolutionSummary[];
  initialSolution: SolutionDetail | null;
  /** The attempt a first solution would build on. */
  baseAttempt: { id: string; version: number } | null;
  canGenerate: boolean;
}) {
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [solutions, setSolutions] = useState(initialSolutions);
  const [viewing, setViewing] = useState(initialSolution);
  const [loading, setLoading] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [tab, setTab] = useState("walkthrough");
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<SolutionRequest | null>(null);
  const [deleting, setDeleting] = useState<"confirm" | "busy" | null>(null);
  const [starting, setStarting] = useState(false);
  const toggleStep = (id: string) =>
    setSelectedSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));

  function show(detail: SolutionDetail) {
    setViewing(detail);
    setSolutions((list) => list.map((s) => (s.id === detail.id ? { ...s, ...pickSummary(detail) } : s)));
    // Keeps the version in the URL for reloads and links without a server round trip.
    window.history.replaceState(null, "", `?v=${detail.version}`);
  }

  async function load(id: string) {
    setLoading(true);
    try {
      const { solution } = await api<{ solution: SolutionDetail }>(`/api/solutions/${id}`);
      show(solution);
      setPlayerIndex(0);
      setTab("walkthrough");
      setSelectedSteps([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that solution.");
    } finally {
      setLoading(false);
    }
  }

  // While a solution is being written, follow its progress stream. Polling is only the fallback for a
  // stream that drops before the run settles.
  const pendingId = viewing && IN_PROGRESS.has(viewing.status) ? viewing.id : null;
  useEffect(() => {
    if (!pendingId) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;

    const setStatus = (status: SolutionStatus) =>
      setViewing((v) => (v?.id === pendingId ? { ...v, status } : v));
    /** Loads the finished solution. Returns false while it's still in progress. */
    const settle = async () => {
      const { solution } = await api<{ solution: SolutionDetail }>(`/api/solutions/${pendingId}`, { signal: abort.signal });
      if (abort.signal.aborted) return true;
      if (IN_PROGRESS.has(solution.status)) {
        setStatus(solution.status);
        return false;
      }
      setViewing((v) => (v?.id === solution.id ? solution : v));
      setSolutions((list) => list.map((s) => (s.id === solution.id ? { ...s, ...pickSummary(solution) } : s)));
      setPlayerIndex(0);
      if (solution.status === "done") toast.success("Solution ready.");
      else toast.error(solution.error?.message ?? "Writing the solution failed.");
      return true;
    };

    void (async () => {
      try {
        const res = await apiRaw(`/api/solutions/${pendingId}/events`, { signal: abort.signal });
        if (!res.ok) throw await toApiError(res);
        for await (const e of readSSE<SolutionEvent>(res)) {
          if (e.type === "status") setStatus(e.status);
          // Done or failed: the stored solution has the result (or the error message).
          else if (await settle()) return;
        }
      } catch {
        if (abort.signal.aborted) return;
      }
      if (abort.signal.aborted) return;
      timer = setInterval(() => {
        settle()
          .then((finished) => finished && clearInterval(timer))
          .catch(() => {}); // Transient failures are fine; keep polling.
      }, 3000);
    })();

    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [pendingId]);

  async function onCreated(summary: SolutionSummary) {
    // A failed run is replaced by the new one on the server.
    setSolutions((list) => [summary, ...list.filter((s) => s.status !== "error")]);
    await load(summary.id);
  }

  async function startFirst() {
    setStarting(true);
    try {
      const { solution } = await api<{ solution: SolutionSummary }>(`/api/problems/${problem.id}/solutions`, {
        method: "POST",
        body: { kind: "initial", ...(baseAttempt && { attemptId: baseAttempt.id }) },
      });
      await onCreated(solution);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the solution.");
    } finally {
      setStarting(false);
    }
  }

  /** Re-runs a failed solution with the same request. */
  async function retry(failed: SolutionDetail) {
    setStarting(true);
    try {
      const { solution } = await api<{ solution: SolutionSummary }>(`/api/problems/${problem.id}/solutions`, {
        method: "POST",
        body: {
          kind: failed.requestKind,
          note: failed.requestNote,
          ...(failed.requestKind === "initial" && baseAttempt && { attemptId: baseAttempt.id }),
        },
      });
      await onCreated(solution);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "exists") {
        const done = solutions.find((s) => s.status === "done");
        if (done) await load(done.id);
      }
      toast.error(err instanceof Error ? err.message : "Couldn't start the solution.");
    } finally {
      setStarting(false);
    }
  }

  async function onDelete() {
    if (!viewing) return;
    setDeleting("busy");
    try {
      await api(`/api/solutions/${viewing.id}`, { method: "DELETE" });
      toast.success(`Solution v${viewing.version} deleted`);
      const remaining = solutions.filter((s) => s.id !== viewing.id);
      setSolutions(remaining);
      setDeleting(null);
      if (remaining.length) await load(remaining[0].id);
      else {
        setViewing(null);
        window.history.replaceState(null, "", "?");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
      setDeleting("confirm");
    }
  }

  const busy = Boolean(pendingId) || loading;
  const spec = viewing?.status === "done" ? viewing.vizSpec : null;
  const content = viewing?.status === "done" ? viewing.content : null;
  const currentLine = spec?.steps[Math.min(playerIndex, spec.steps.length - 1)]?.line ?? null;
  const viewingSummary = viewing ? (solutions.find((s) => s.id === viewing.id) ?? null) : null;
  const jumpToStep = (i: number) => {
    setPlayerIndex(i);
    setTab("walkthrough");
  };

  const left = (
    <div className="flex flex-col gap-4 p-4">
      <Link
        href={`/problems/${problem.id}`}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Back to your attempts
      </Link>

      <Collapsible defaultOpen={!viewing}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-brand-strong uppercase">Solution</p>
            <h1 className="text-xl leading-snug font-semibold tracking-tight text-balance">{problem.title}</h1>
          </div>
          <CollapsibleTrigger render={<Button variant="soft" size="sm" className="shrink-0 data-panel-open:[&_svg]:rotate-180" />}>
            Statement <ChevronDownIcon className="transition-transform" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border bg-tile p-3 font-sans text-sm whitespace-pre-wrap">
            {problem.statement}
          </pre>
        </CollapsibleContent>
      </Collapsible>

      {solutions.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            items={solutions.map((s) => ({ value: s.id, label: versionLabel(s) }))}
            value={viewing?.id ?? null}
            disabled={busy}
            onValueChange={(v) => v && v !== viewing?.id && void load(v)}
          >
            <SelectTrigger className="w-full min-w-0" aria-label="Solution version">
              <SelectValue placeholder="Pick a solution" />
            </SelectTrigger>
            <SelectContent>
              {solutions.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {versionLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="brand"
            className="shrink-0"
            disabled={busy || !canGenerate || !solutions.some((s) => s.status === "done")}
            onClick={() => {
              setPrefill(null);
              setNewOpen(true);
            }}
          >
            <CopyPlusIcon /> New solution
          </Button>
          {viewing && (
            <Button
              variant="destructive"
              size="icon"
              className="shrink-0"
              aria-label={`Delete solution v${viewing.version}`}
              title="Delete this solution"
              disabled={busy}
              onClick={() => setDeleting("confirm")}
            >
              <Trash2Icon />
            </Button>
          )}
        </div>
      )}

      {content && viewing && (
        <>
          <section className="flex flex-col gap-3" aria-label="Approach">
            <div>
              <p className="text-xs text-muted-foreground">
                {SOLUTION_REQUEST_LABELS[viewing.requestKind]}
                {viewing.requestKind === "initial" && viewing.basedOnAttemptVersion
                  ? ` v${viewing.basedOnAttemptVersion}`
                  : viewing.requestNote
                    ? `: ${viewing.requestNote}`
                    : ""}
              </p>
              <h2 className="text-lg font-semibold tracking-tight">{content.name}</h2>
            </div>
            <dl className="flex flex-wrap gap-2 text-sm">
              <div className="flex items-center gap-1.5 rounded-full border bg-tile px-3 py-1">
                <dt className="text-muted-foreground">Time</dt>
                <dd className="font-mono font-medium">{content.complexity.time}</dd>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border bg-tile px-3 py-1">
                <dt className="text-muted-foreground">Space</dt>
                <dd className="font-mono font-medium">{content.complexity.space}</dd>
              </div>
            </dl>
            <p className="text-sm">{content.summary}</p>
            {content.relationToAttempt && (
              <div className="flex gap-2 rounded-lg border border-brand bg-brand-soft p-3 text-sm">
                <GitBranchIcon className="mt-0.5 size-4 shrink-0 text-brand-strong" aria-hidden />
                <div>
                  <p className="font-medium">
                    {viewing.requestKind === "initial"
                      ? `From your attempt${viewing.basedOnAttemptVersion ? ` v${viewing.basedOnAttemptVersion}` : ""}`
                      : "Compared with your other solutions"}
                  </p>
                  <p className="text-muted-foreground">{content.relationToAttempt}</p>
                </div>
              </div>
            )}
            {content.keyIdeas.length > 0 && (
              <div>
                <h3 className="mb-1 flex items-center gap-1.5 text-sm font-medium">
                  <LightbulbIcon className="size-4 text-brand-strong" aria-hidden /> Key ideas
                </h3>
                <ol className="flex list-inside list-decimal flex-col gap-1 text-sm text-muted-foreground marker:text-brand-strong">
                  {content.keyIdeas.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ol>
              </div>
            )}
            <div>
              <h3 className="mb-1 text-sm font-medium">Why it works</h3>
              <p className="text-sm text-muted-foreground">{content.whyItWorks}</p>
            </div>
            <div>
              <h3 className="mb-1 text-sm font-medium">Complexity</h3>
              <p className="text-sm text-muted-foreground">{content.complexity.explanation}</p>
            </div>
          </section>

          <section className="flex flex-col gap-2" aria-label="Code">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-medium">
                Code <span className="font-normal text-muted-foreground">· {languageLabel(viewing.language)}</span>
              </h3>
              <CopyCodeButton code={content.codeLines.join("\n")} />
            </div>
            <CodePane lines={content.codeLines} activeLine={tab === "walkthrough" ? currentLine : null} className="max-h-[28rem]" />
            {!content.verified && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <TriangleAlertIcon className="mt-0.5 size-3.5 shrink-0 text-viz-error" aria-hidden />
                When this code was run on the test input, its result didn&apos;t match the expected one. The problem may
                accept several answers, but double-check it, or ask about it in the chat.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );

  let right: React.ReactNode;
  if (loading) {
    right = (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (!viewing) {
    right = (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <LightbulbIcon className="size-5" aria-hidden />
        </span>
        <div className="flex max-w-sm flex-col gap-1">
          <p className="font-medium">No solution yet</p>
          <p className="text-sm text-muted-foreground">
            Seeing it ends the puzzle, so it&apos;s worth one more try with the hints first.
            {baseAttempt ? ` When you're ready, it builds on your attempt v${baseAttempt.version}.` : ""}
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Link href={`/problems/${problem.id}`} className={buttonVariants({ variant: "brand" })}>
            I&apos;ll try once more
          </Link>
          <LoadingButton variant="outline" loading={starting} disabled={!canGenerate} onClick={startFirst}>
            {starting ? "Starting…" : "Show me the solution"}
          </LoadingButton>
        </div>
      </div>
    );
  } else if (IN_PROGRESS.has(viewing.status)) {
    right = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8" role="status" aria-live="polite">
        <div>
          <h2 className="font-medium">Writing your solution</h2>
          <p className="text-sm text-muted-foreground">
            This usually takes a minute or two. You can leave this page; it&apos;ll be here when you come back.
          </p>
        </div>
        <ProgressStepper status={viewing.status} stages={STAGES} order={ORDER} />
      </div>
    );
  } else if (viewing.status === "error" || !spec || !content) {
    right = (
      <div className="flex flex-col items-start gap-4 p-6">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Writing the solution failed</AlertTitle>
          <AlertDescription>{viewing.error?.message ?? "Something went wrong."}</AlertDescription>
        </Alert>
        <LoadingButton variant="soft" loading={starting} disabled={!canGenerate} onClick={() => void retry(viewing)}>
          <RotateCcwIcon /> Try again
        </LoadingButton>
      </div>
    );
  } else {
    right = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Input: <span className="font-mono text-foreground">{spec.summary.testInputDescription}</span>
            <span className="mx-1.5">→</span>
            <span className="font-mono text-foreground">{spec.summary.actualOutput}</span>
          </p>
          <UsageBadge attempt={viewing} executionLabel="Traced by running the solution in a sandbox" />
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList>
            <TabsTrigger value="walkthrough">Walkthrough</TabsTrigger>
            <TabsTrigger value="lines">Line by line</TabsTrigger>
          </TabsList>
          <TabsContent value="walkthrough" className="flex flex-col gap-4 pt-3">
            <Player
              key={viewing.id}
              spec={spec}
              index={playerIndex}
              onIndexChange={setPlayerIndex}
              layoutId={viewing.id}
              selectedStepIds={new Set(selectedSteps)}
              onToggleStepSelect={toggleStep}
              skipControls
            />
            <Collapsible defaultOpen={spec.loops.length > 0}>
              <CollapsibleTrigger
                render={
                  <Button variant="ghost" size="sm" className="-ml-2 data-panel-open:[&_svg]:rotate-180" />
                }
              >
                Every step, grouped by loop iteration <ChevronDownIcon className="transition-transform" />
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <StepOutline spec={spec} current={playerIndex} onSeek={setPlayerIndex} />
              </CollapsibleContent>
            </Collapsible>
          </TabsContent>
          <TabsContent value="lines" className="pt-3">
            <LineBreakdown content={content} spec={spec} activeLine={currentLine} onJumpToStep={jumpToStep} />
          </TabsContent>
        </Tabs>
        <ChatPanel
          key={viewing.id}
          endpoint={`/api/solutions/${viewing.id}/messages`}
          title="Ask about this solution"
          example={<>e.g. &ldquo;Why does this loop start at 1?&rdquo; or &ldquo;Can it be done in O(1) space?&rdquo;</>}
          steps={spec.steps}
          selectedStepIds={selectedSteps}
          onToggleStep={toggleStep}
          onClearSelection={() => setSelectedSteps([])}
          onProposal={
            canGenerate
              ? (p) => {
                  if (p.kind === "initial") return;
                  setPrefill({ kind: p.kind, note: p.note });
                  setNewOpen(true);
                }
              : undefined
          }
        />
      </div>
    );
  }

  const dialogs = (
    <>
      <NewSolutionDialog
        problemId={problem.id}
        open={newOpen}
        onOpenChange={setNewOpen}
        initial={prefill}
        current={viewingSummary}
        onCreated={(s) => void onCreated(s)}
      />
      <Dialog open={deleting !== null} onOpenChange={(o) => !o && deleting !== "busy" && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete solution v{viewing?.version}?</DialogTitle>
            <DialogDescription>This removes its code, walkthrough and chat. It can&apos;t be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deleting === "busy"}>
              Cancel
            </Button>
            <LoadingButton variant="destructive" onClick={onDelete} loading={deleting === "busy"}>
              {deleting === "busy" ? "Deleting…" : "Delete"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );

  if (!isDesktop) {
    return (
      <div className="flex flex-col bg-paper">
        {left}
        <div className="border-t">{right}</div>
        {dialogs}
      </div>
    );
  }

  return (
    <>
      {/* Same sizing as the workspace: the header is 3.5rem plus a 1px border. */}
      <ResizablePanelGroup orientation="horizontal" style={{ height: "calc(100dvh - 3.5rem - 1px)" }}>
        <ResizablePanel defaultSize="38%" minSize="25%" className="overflow-y-auto bg-paper">
          {left}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize="62%" minSize="35%" className="overflow-y-auto bg-paper">
          {right}
        </ResizablePanel>
      </ResizablePanelGroup>
      {dialogs}
    </>
  );
}

function pickSummary(d: SolutionDetail): Partial<SolutionSummary> {
  return { status: d.status, name: d.name, time: d.time, space: d.space };
}

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <Button
      variant="ghost"
      size="xs"
      onClick={() =>
        navigator.clipboard.writeText(code).then(
          () => setCopied(true),
          () => toast.error("Couldn't copy."),
        )
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}
