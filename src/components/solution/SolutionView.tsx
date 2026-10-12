"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, ChevronDownIcon, CopyPlusIcon, LightbulbIcon, RotateCcwIcon, SquareIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { ShareButton } from "@/components/share/share-button";
import { SourceLink } from "@/components/problems/source-link";
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
import { ChangeModelLink } from "@/components/workspace/ChangeModelLink";
import { ChatDock, useChatDock } from "@/components/workspace/ChatDock";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { solutionProgressDetails } from "@/components/workspace/RunProgressDetails";
import { UsageBadge } from "@/components/workspace/UsageBadge";
import { useTour } from "@/components/tour/use-tour";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { SolutionEvent } from "@/lib/ai/pipeline/events";
import { buildsOnAttempt } from "@/lib/ai/schemas/solution";
import { stepAt, stepRefs } from "@/lib/ai/schemas/vizSpec";
import { ApiClientError, api, apiRaw, toApiError } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import type { SolutionDetail, SolutionSummary } from "@/lib/solutions";
import { problemPath } from "@/lib/slug";
import { playCompletionSound } from "@/lib/sounds";
import type { TourId } from "@/lib/tours";
import { readSSE } from "@/lib/sse";
import type { SolutionStatus } from "@/models/Solution";
import type { ChatLayout } from "@/models/User";
import { NewSolutionDialog, type SolutionRequest } from "./NewSolutionDialog";
import { SolutionApproach, SolutionWalkthrough } from "./SolutionDetails";

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
  }${buildsOnAttempt(s.requestKind) && s.basedOnAttemptVersion ? ` · from attempt v${s.basedOnAttemptVersion}` : ""}`;

export function SolutionView({
  problem,
  initialSolutions,
  initialSolution,
  baseAttempt,
  canGenerate,
  chatLayout,
  toursSeen,
}: {
  problem: ProblemDetail;
  initialSolutions: SolutionSummary[];
  initialSolution: SolutionDetail | null;
  /** The attempt a first solution would build on. */
  baseAttempt: { id: string; version: number } | null;
  canGenerate: boolean;
  /** The learner's saved choice of where the chat sits. */
  chatLayout: ChatLayout;
  /** First-run tours the learner has already been shown. */
  toursSeen: TourId[];
}) {
  const chatDock = useChatDock(chatLayout);
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [solutions, setSolutions] = useState(initialSolutions);
  const [viewing, setViewing] = useState(initialSolution);
  const [loading, setLoading] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const [tab, setTab] = useState("walkthrough");
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);
  const [prefill, setPrefill] = useState<SolutionRequest | null>(null);
  const [deleting, setDeleting] = useState<"confirm" | "busy" | null>(null);
  const [starting, setStarting] = useState(false);
  /** The solution a stop was sent for. It stays "Stopping…" until the run is gone, since the server may take a moment to notice. */
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const stopping = stoppingId !== null && stoppingId === viewing?.id;
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
      setCaseIndex(0);
      setTab("walkthrough");
      setSelectedSteps([]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that solution.");
    } finally {
      setLoading(false);
    }
  }

  /** Takes a solution out of the list and shows the newest one left, or the empty state. */
  async function drop(id: string) {
    const remaining = solutions.filter((s) => s.id !== id);
    setSolutions(remaining);
    if (remaining.length) await load(remaining[0].id);
    else {
      setViewing(null);
      window.history.replaceState(null, "", "?");
    }
  }

  // Stopped (here or in another tab): the run deleted it. Skipped when stopSolution() already took it out.
  const onStopped = useEffectEvent((id: string) => {
    if (solutions.some((s) => s.id === id)) void drop(id);
  });

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
        setViewing((v) => (v?.id === pendingId ? { ...v, status: solution.status, progress: solution.progress } : v));
        return false;
      }
      setViewing((v) => (v?.id === solution.id ? solution : v));
      setSolutions((list) => list.map((s) => (s.id === solution.id ? { ...s, ...pickSummary(solution) } : s)));
      setPlayerIndex(0);
      setCaseIndex(0);
      if (solution.status === "done") {
        playCompletionSound();
        toast.success("Solution ready.");
      } else toast.error(solution.error?.message ?? "Writing the solution failed.");
      return true;
    };

    void (async () => {
      try {
        const res = await apiRaw(`/api/solutions/${pendingId}/events`, { signal: abort.signal });
        if (!res.ok) throw await toApiError(res);
        for await (const e of readSSE<SolutionEvent>(res)) {
          if (e.type === "status") setStatus(e.status);
          else if (e.type === "progress") setViewing((v) => (v?.id === pendingId ? { ...v, progress: e.progress } : v));
          else if (e.type === "error" && e.code === "cancelled") {
            onStopped(pendingId);
            return;
          }
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
          .catch((err) => {
            // Gone: stopped, or discarded by the run itself.
            if (err instanceof ApiClientError && err.status === 404) {
              clearInterval(timer);
              onStopped(pendingId);
            }
            // Otherwise transient; keep polling.
          });
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
          ...(failed.basedOnAttemptId
            ? { attemptId: failed.basedOnAttemptId }
            : failed.requestKind === "initial" && baseAttempt && { attemptId: baseAttempt.id }),
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
      setDeleting(null);
      await drop(viewing.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
      setDeleting("confirm");
    }
  }

  /**
   * Stops the solution being written. The stopped run is deleted, so it takes no version number. The button
   * stays on "Stopping…" until the run is gone: the server answers as soon as it's told, but a step that can't
   * be interrupted may still be finishing, and the progress stream then reports the stop.
   */
  async function stopSolution() {
    if (!viewing || stopping) return;
    const id = viewing.id;
    setStoppingId(id);
    try {
      const { stopped, pending } = await api<{ stopped: boolean; pending: boolean }>(`/api/solutions/${id}/cancel`, {
        method: "POST",
      });
      if (stopped) await drop(id);
      else if (!pending) {
        setStoppingId(null);
        toast.info("It finished before it could be stopped.");
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        // Already removed, by an earlier stop or by the run itself failing.
        await drop(id);
        return;
      }
      setStoppingId(null);
      // Already finished: the progress stream brings in the result.
      if (!(err instanceof ApiClientError && err.code === "finished")) {
        toast.error(err instanceof Error ? err.message : "Couldn't stop it.");
      }
    }
  }

  const busy = Boolean(pendingId) || loading;
  const spec = viewing?.status === "done" ? viewing.vizSpec : null;
  const content = viewing?.status === "done" ? viewing.content : null;
  const currentLine = (spec && stepAt(spec, caseIndex, playerIndex)?.line) ?? null;
  const viewingSummary = viewing ? (solutions.find((s) => s.id === viewing.id) ?? null) : null;

  useTour("solution", { seen: toursSeen, ready: Boolean(spec && content) && !loading });

  const left = (
    <div className="flex flex-col gap-4 p-4">
      <Link
        href={problemPath(problem)}
        className="inline-flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Back to your attempts
      </Link>

      <Collapsible defaultOpen={!viewing}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-medium tracking-wide text-brand-strong uppercase">Solution</p>
            <h1 className="text-xl leading-snug font-semibold tracking-tight text-balance">{problem.title}</h1>
            {problem.sourceUrl && (
              <div className="mt-2">
                <SourceLink url={problem.sourceUrl} />
              </div>
            )}
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
        <div className="flex items-center gap-2" data-tour="versions">
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
          {viewing?.status === "done" && (
            <ShareButton
              key={`share-${viewing.id}`}
              kind="solution"
              targetId={viewing.id}
              token={viewing.shareToken}
              disabled={busy}
              onChange={(shareToken) => setViewing((v) => (v?.id === viewing.id ? { ...v, shareToken } : v))}
            />
          )}
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
        <SolutionApproach
          content={content}
          language={viewing.language}
          model={viewing.model}
          activeLine={tab === "walkthrough" ? currentLine : null}
          origin={{
            requestKind: viewing.requestKind,
            requestNote: viewing.requestNote,
            basedOnAttemptVersion: viewing.basedOnAttemptVersion,
          }}
        />
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
          <Link href={problemPath(problem)} className={buttonVariants({ variant: "brand" })}>
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
        <ProgressStepper
          status={viewing.status}
          stages={STAGES}
          order={ORDER}
          details={solutionProgressDetails(viewing.progress)}
        />
        <LoadingButton
          variant="destructive"
          className="self-start"
          loading={stopping}
          icon={<SquareIcon />}
          onClick={() => void stopSolution()}
        >
          {stopping ? "Stopping…" : "Stop processing"}
        </LoadingButton>
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
        <div className="flex flex-wrap gap-2">
          <LoadingButton variant="soft" loading={starting} disabled={!canGenerate} onClick={() => void retry(viewing)}>
            <RotateCcwIcon /> Try again
          </LoadingButton>
          <ChangeModelLink />
        </div>
      </div>
    );
  } else {
    right = (
      <div className="flex flex-col gap-3 p-4">
        <SolutionWalkthrough
          layoutId={viewing.id}
          spec={spec}
          content={content}
          language={viewing.language}
          caseIndex={caseIndex}
          onCaseChange={setCaseIndex}
          playerIndex={playerIndex}
          onIndexChange={setPlayerIndex}
          tab={tab}
          onTabChange={setTab}
          selectedStepIds={selectedSteps}
          onToggleStep={toggleStep}
          badge={<UsageBadge attempt={viewing} executionLabel="Traced by running the solution in a sandbox" />}
        />
        <ChatDock
          key={viewing.id}
          dock={chatDock}
          endpoint={`/api/solutions/${viewing.id}/messages`}
          title="Ask about this solution"
          example={<>e.g. &ldquo;Why does this loop start at 1?&rdquo; or &ldquo;Can it be done in O(1) space?&rdquo;</>}
          caseId={spec.cases[Math.min(caseIndex, spec.cases.length - 1)].id}
          stepRefs={stepRefs(spec)}
          selectedStepIds={selectedSteps}
          onToggleStep={toggleStep}
          onClearSelection={() => setSelectedSteps([])}
          onProposal={
            canGenerate
              ? (p) => {
                  if (buildsOnAttempt(p.kind)) return;
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
