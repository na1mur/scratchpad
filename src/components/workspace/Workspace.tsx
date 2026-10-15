"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  CodeIcon,
  CopyPlusIcon,
  CpuIcon,
  EraserIcon,
  InfoIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  SquareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { SourceLink } from "@/components/problems/source-link";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CaseBar, casesPassedText } from "@/components/viz/CaseBar";
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { HintsPanel } from "@/components/viz/HintsPanel";
import { Player } from "@/components/viz/Player";
import { LoadingButton } from "@/components/loading-button";
import { ShareButton } from "@/components/share/share-button";
import { FixAttemptButton } from "@/components/solution/FixAttemptButton";
import { SolutionButton } from "@/components/solution/SolutionButton";
import { ChangeModelLink } from "@/components/workspace/ChangeModelLink";
import { ChatDock, chatOnSide, splitSizes, useChatDock } from "@/components/workspace/ChatDock";
import { DeleteAttemptButton } from "@/components/workspace/DeleteAttemptButton";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { useNotebookUpload, type UploadedImage } from "@/components/workspace/NotebookUpload";
import { ProblemActions } from "@/components/workspace/ProblemActions";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { attemptProgressDetails } from "@/components/workspace/RunProgressDetails";
import { UsageBadge } from "@/components/workspace/UsageBadge";
import { useTour } from "@/components/tour/use-tour";
import { useMediaQuery } from "@/hooks/use-media-query";
import { caseView, stepRefs } from "@/lib/ai/schemas/vizSpec";
import type { AttemptDetail, AttemptSummary } from "@/lib/attempts";
import { ApiClientError, api, apiRaw, toApiError } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { CodeRunner } from "./CodeRunner";
import { TestCases } from "./TestCases";
import { starterCode } from "@/lib/runner/entry";
import { isRunLanguage } from "@/lib/runner/protocol";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/providers";
import { createAttemptSchema, type CreateAttemptInput } from "@/lib/schemas/attempts";
import { MAX_TEXT } from "@/lib/schemas/problems";
import { playCompletionSound } from "@/lib/sounds";
import { readSSE } from "@/lib/sse";
import type { TourId } from "@/lib/tours";
import { VERDICT_LABELS } from "@/lib/verdicts";
import type { RunProgress } from "@/lib/runProgress";
import type { AttemptStatus } from "@/models/Attempt";
import type { ChatLayout } from "@/models/User";

type StreamEvent =
  | { type: "attempt"; attemptId: string; version: number }
  | { type: "status"; status: AttemptStatus }
  | { type: "progress"; progress: RunProgress }
  | { type: "done"; attemptId: string }
  | { type: "error"; code: string; message: string; discarded?: boolean };

type Running = { attemptId: string | null; status: AttemptStatus; progress?: RunProgress | null };

const IN_PROGRESS = new Set<AttemptStatus>(["queued", "extracting", "understanding", "tracing", "diagnosing"]);

/** Attempts already use "v1, v2"; regenerated visualizations get their own wording. */
const specLabel = (version: number) => (version === 1 ? "Original visualization" : `Regenerated #${version - 1}`);

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

function EditorKeysHint() {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            tabIndex={0}
            aria-label="Editor shortcuts"
            className="flex cursor-default rounded-sm text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        }
      >
        <InfoIcon className="size-3.5" aria-hidden />
      </TooltipTrigger>
      <TooltipContent className="flex flex-col items-start gap-0.5 bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 [&>div]:hidden">
        <span>New lines keep the previous line&apos;s indentation, one level deeper after a colon.</span>
        <span>Ctrl+Backspace clears it to start from the line&apos;s beginning.</span>
      </TooltipContent>
    </Tooltip>
  );
}

function ClearButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick} />}
      >
        <EraserIcon />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

export function Workspace({
  problem,
  initialAttempts,
  initialAttempt,
  aiModel,
  uploadsEnabled,
  hasSolution,
  chatLayout,
  toursSeen,
}: {
  problem: ProblemDetail;
  initialAttempts: AttemptSummary[];
  initialAttempt: AttemptDetail | null;
  /** The provider and model new attempts will use. */
  /** `hasKey` is false once the learner deleted the key their model used. */
  aiModel: { provider: ProviderId; model: string; hasKey: boolean } | null;
  uploadsEnabled: boolean;
  /** Whether a solution exists (or is being written), so the button opens it instead of asking first. */
  hasSolution: boolean;
  /** The learner's saved choice of where the chat sits. */
  chatLayout: ChatLayout;
  /** First-run tours the learner has already been shown. */
  toursSeen: TourId[];
}) {
  const router = useRouter();
  const chatDock = useChatDock(chatLayout);
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [viewing, setViewing] = useState<AttemptDetail | null>(initialAttempt);
  const [mode, setMode] = useState<"new" | "view">(initialAttempt ? "view" : "new");
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [runnerOpen, setRunnerOpen] = useState(false);
  const [running, setRunning] = useState<Running | null>(
    initialAttempt && IN_PROGRESS.has(initialAttempt.status)
      ? { attemptId: initialAttempt.id, status: initialAttempt.status, progress: initialAttempt.progress }
      : null,
  );
  const [streaming, setStreaming] = useState(false);
  /** The run a stop was sent for. It stays "Stopping…" until the run is gone, since the server may take a moment to notice. */
  const [stoppingId, setStoppingId] = useState<string | null>(null);
  const stoppingRef = useRef<string | null>(null);
  const stopping = stoppingId !== null && stoppingId === running?.attemptId;
  /** Why the last run produced nothing. Such a run isn't kept as an attempt, so it's explained in the results pane. */
  const [failure, setFailure] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [caseIndex, setCaseIndex] = useState(0);
  const [tab, setTab] = useState("viz");
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const toggleStep = (id: string) =>
    setSelectedSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));
  const pollToken = useRef(0);
  const resultsRef = useRef<HTMLDivElement>(null);

  const form = useForm<CreateAttemptInput>({
    resolver: zodResolver(createAttemptSchema),
    defaultValues: { pseudoCode: initialAttempt?.pseudoCode ?? "", idea: initialAttempt?.idea ?? "", images: [] },
  });

  /** When the panes are stacked, brings the results into view so a phone user isn't left looking at the form. */
  function revealResults() {
    if (isDesktop) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current?.scrollIntoView({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
  }

  async function loadAttempt(attemptId: string, specVersion?: number) {
    setLoadingAttempt(true);
    try {
      const query = specVersion ? `?specVersion=${specVersion}` : "";
      const { attempt } = await api<{ attempt: AttemptDetail }>(`/api/attempts/${attemptId}${query}`);
      setViewing(attempt);
      setMode("view");
      setFailure(null);
      setPlayerIndex(0);
      setCaseIndex(0);
      setTab("viz");
      setSelectedSteps([]);
      setAttempts((list) => list.map((a) => (a.id === attempt.id ? { ...a, status: attempt.status, verdict: attempt.verdict } : a)));
      revealResults();
      return attempt;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that attempt.");
      return null;
    } finally {
      setLoadingAttempt(false);
    }
  }

  // Ask before closing or reloading the tab mid-run. Browsers show their own generic wording.
  const isRunning = Boolean(running);
  useEffect(() => {
    if (!isRunning) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isRunning]);

  // After a reload (or a dropped stream) progress comes from polling.
  useEffect(() => {
    if (!running?.attemptId || streaming) return;
    const token = ++pollToken.current;
    const attemptId = running.attemptId;
    const timer = setInterval(async () => {
      try {
        const { attempt } = await api<{ attempt: AttemptDetail }>(`/api/attempts/${attemptId}`);
        if (token !== pollToken.current) return;
        if (IN_PROGRESS.has(attempt.status)) {
          setRunning({ attemptId, status: attempt.status, progress: attempt.progress });
          return;
        }
        clearInterval(timer);
        setRunning(null);
        notifyFinished(attempt);
        setViewing(attempt);
        setMode("view");
        setPlayerIndex(0);
        setCaseIndex(0);
        setAttempts((list) => list.map((a) => (a.id === attempt.id ? { ...a, status: attempt.status, verdict: attempt.verdict } : a)));
        router.refresh();
      } catch (err) {
        if (token !== pollToken.current) return;
        // The run failed and was discarded, so there's no attempt to find. The form still has its text.
        if (err instanceof ApiClientError && err.status === 404) {
          clearInterval(timer);
          setRunning(null);
          setAttempts((list) => list.filter((a) => a.id !== attemptId));
          setViewing((v) => (v?.id === attemptId ? null : v));
          setMode("new");
          // A run the learner stopped is gone on purpose; only an unexplained disappearance is a failure.
          setFailure(stoppingRef.current === attemptId ? null : "The run didn't finish.");
          router.refresh();
        }
        // Otherwise keep polling; transient failures are fine.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running?.attemptId, streaming, router]);

  /** Drops a failed or stopped run that the server discarded and returns to the editable draft. */
  function discardRun(attemptId: string | null, message: string | null) {
    setRunning(null);
    setAttempts((list) => list.filter((a) => a.id !== attemptId));
    setViewing((v) => (v?.id === attemptId ? null : v));
    setMode("new");
    setFailure(message);
    router.refresh();
  }

  function notifyFinished(attempt: AttemptDetail) {
    if (attempt.status === "error") toast.error(attempt.error?.message ?? "Processing failed.");
    else {
      playCompletionSound();
      if (attempt.verdict === "works") toast.success("Analysis ready: your approach works on this input.");
      else toast.success("Analysis ready. Step through it to see where it breaks.");
    }
  }

  async function onProcess(values: CreateAttemptInput) {
    setFailure(null);
    setRunning({ attemptId: null, status: "queued" });
    setStreaming(true);
    revealResults();
    let attemptId: string | null = null;
    let finished = false;
    try {
      const res = await apiRaw(`/api/problems/${problem.id}/attempts`, { method: "POST", body: values });
      if (!res.ok) throw await toApiError(res);
      for await (const e of readSSE<StreamEvent>(res)) {
        if (e.type === "attempt") {
          attemptId = e.attemptId;
          setRunning({ attemptId, status: "queued" });
          setAttempts((list) => [
            { id: e.attemptId, version: e.version, status: "queued", verdict: null, createdAt: new Date().toISOString() },
            ...list,
          ]);
        } else if (e.type === "status" && attemptId) {
          setRunning((r) => r && { ...r, status: e.status });
        } else if (e.type === "progress" && attemptId) {
          setRunning((r) => r && { ...r, progress: e.progress });
        } else if (e.type === "done") {
          finished = true;
          setRunning(null);
          const attempt = await loadAttempt(e.attemptId);
          if (attempt) notifyFinished(attempt);
          router.refresh();
        } else if (e.type === "error") {
          finished = true;
          if (e.code === "cancelled") {
            // Stopped by the learner, who already knows: back to the draft without an error.
            discardRun(attemptId, null);
          } else if (e.discarded) {
            // Nothing was saved: the learner stays on their draft and can press Process again.
            discardRun(attemptId, e.message);
            toast.error(e.message);
          } else {
            setRunning(null);
            if (attemptId) await loadAttempt(attemptId);
            toast.error(e.message);
          }
        }
      }
    } catch (err) {
      finished = !attemptId;
      if (!attemptId) setRunning(null);
      toast.error(err instanceof Error ? err.message : "Couldn't start processing.");
    } finally {
      setStreaming(false);
      // Stream dropped mid-run: the polling effect takes over.
      if (!finished && attemptId) {
        const id = attemptId;
        setRunning((r) => ({ attemptId: id, status: "tracing", progress: r?.progress }));
      }
    }
  }

  /**
   * Stops the run in progress. The draft stays in the form, ready to edit and process again. The button stays
   * on "Stopping…" until the run is gone: the server answers as soon as it's told, but a step that can't be
   * interrupted may still be finishing.
   */
  async function stopRun() {
    const attemptId = running?.attemptId;
    if (!attemptId || stopping) return;
    stoppingRef.current = attemptId;
    setStoppingId(attemptId);
    /** Back to the draft if there's no stream to say so; a polled run has none. */
    const settled = () => {
      if (streaming) return;
      pollToken.current++;
      discardRun(attemptId, null);
    };
    try {
      const { stopped, pending } = await api<{ stopped: boolean; pending: boolean }>(`/api/attempts/${attemptId}/cancel`, {
        method: "POST",
      });
      if (stopped) settled();
      else if (!pending) {
        stoppingRef.current = null;
        setStoppingId(null);
        toast.info("It finished before it could be stopped.");
      }
      // Pending: still winding down. The stream's cancelled event or the poll clears the view.
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) {
        // Already removed, by an earlier stop or by the run itself failing.
        settled();
        return;
      }
      stoppingRef.current = null;
      setStoppingId(null);
      // Already finished: the stream or the poll brings in the result.
      if (!(err instanceof ApiClientError && err.code === "finished")) {
        toast.error(err instanceof Error ? err.message : "Couldn't stop it.");
      }
    }
  }

  /** `clear` starts from a blank slate instead of carrying the source attempt's text over. */
  function startNewAttempt(prefill?: AttemptDetail | null, clear = false) {
    const source = clear ? null : (prefill ?? viewing);
    form.reset({ pseudoCode: source?.pseudoCode ?? "", idea: source?.idea ?? "", images: [] });
    setMode("new");
    setFailure(null);
  }

  /** Asks whether to clear the previous text, unless there's nothing to clear. */
  function requestNewAttempt() {
    if (viewing && (viewing.pseudoCode.trim() || viewing.idea.trim())) setConfirmingNew(true);
    else startNewAttempt();
  }

  async function onAttemptDeleted(attemptId: string) {
    const remaining = attempts.filter((a) => a.id !== attemptId);
    setAttempts(remaining);
    router.refresh();
    if (remaining.length) {
      await loadAttempt(remaining[0].id);
    } else {
      setViewing(null);
      form.reset({ pseudoCode: "", idea: "", images: [] });
      setMode("new");
    }
  }

  const readOnly = mode === "view" || Boolean(running);
  const draftCode = useWatch({ control: form.control, name: "pseudoCode" });
  const shownCode = mode === "view" && viewing ? viewing.pseudoCode : draftCode;
  const draftIdea = useWatch({ control: form.control, name: "idea" });
  const draftImages =(useWatch({ control: form.control, name: "images" }) ?? []) as UploadedImage[];
  const notebook = useNotebookUpload({
    problemId: problem.id,
    images: draftImages,
    onChange: (images) => form.setValue("images", images, { shouldDirty: true }),
    disabled: Boolean(running),
    onExtracted: ({ pseudoCode, notes }) => {
      const { pseudoCode: code, idea } = form.getValues();
      // Append rather than overwrite: never lose what the learner already typed.
      const join = (a: string | undefined, b: string) => (a?.trim() ? `${a.trimEnd()}\n\n${b}` : b);
      if (pseudoCode.trim()) form.setValue("pseudoCode", join(code, pseudoCode), { shouldDirty: true });
      if (notes.trim()) form.setValue("idea", join(idea, notes), { shouldDirty: true });
    },
  });
  // Attempts made before the model was recorded fall back to the learner's current model.
  const ranOn = viewing?.model ?? aiModel;
  const canRun = Boolean(aiModel?.hasKey);
  const ranOnIsCurrent = !viewing?.model;
  // While drafting a new attempt nothing is selected; the trigger shows a placeholder instead.
  const selectValue = mode === "new" ? null : (viewing?.id ?? null);
  const attemptItems = attempts.map((a) => ({
    value: a.id,
    label: `v${a.version} · ${a.verdict ? VERDICT_LABELS[a.verdict] : IN_PROGRESS.has(a.status) ? "processing" : a.status === "error" ? "failed" : "…"} · ${shortDate.format(new Date(a.createdAt))}`,
  }));

  // The first solution builds on the attempt being viewed, or else the newest one that finished.
  const solutionBase =
    mode === "view" && viewing?.status === "done" ? viewing : (attempts.find((a) => a.status === "done") ?? null);

  // First time on a problem: the form. First finished analysis: the results.
  useTour("workspace", { seen: toursSeen, ready: mode === "new" && !running && !confirmingNew });
  // Playground needs a language the browser can run and the problem's test cases.
  const harness = problem.harness;
  const runnable = isRunLanguage(problem.language) && harness.status === "ready" ? { language: problem.language, view: harness } : null;

  // Playground is there from the start, beside the title. It opens the code the visualization shows once an
  // analysis has it (the completed code, added lines included), the attempt as written before that, and while
  // drafting, the draft; with nothing written yet, an empty function with the signature the tests call.
  let runner: { draftKey: string; code: string; title: string } | null = null;
  if (runnable) {
    const starter = () => starterCode(runnable.language, runnable.view);
    if (mode === "view" && viewing?.vizSpec) {
      runner = {
        draftKey: `${viewing.id}-${viewing.specVersion}`,
        code: viewing.vizSpec.codeLines.join("\n"),
        title: "Edit the completed code from this analysis and run it on the test cases, in your browser",
      };
    } else if (mode === "view" && viewing) {
      runner = {
        draftKey: `attempt-${viewing.id}`,
        code: viewing.pseudoCode.trim() ? viewing.pseudoCode : starter(),
        title: "Edit this attempt's code and run it on the test cases, in your browser",
      };
    } else {
      runner = {
        draftKey: `new-${problem.id}`,
        code: draftCode?.trim() ? draftCode : starter(),
        title: "Run your code on the test cases in your browser before processing it: no tokens, nothing saved",
      };
    }
  }

  useTour("analysis", {
    seen: toursSeen,
    ready: mode === "view" && viewing?.status === "done" && Boolean(viewing.vizSpec) && !running && !loadingAttempt,
  });
  // Playground for someone who took the workspace tour before it had that step. Called after the analysis
  // tour so that one goes first when both are due (it covers this one).
  useTour("editRun", {
    seen: toursSeen,
    ready: Boolean(runner) && toursSeen.includes("workspace") && !running && !loadingAttempt && !confirmingNew,
  });


  const left = (
    <div className="flex flex-col gap-4 p-4">
      <Collapsible defaultOpen={!initialAttempt}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-xl leading-snug font-semibold tracking-tight text-balance">{problem.title}</h1>
            {(problem.tags.length > 0 || problem.sourceUrl) && (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {problem.tags.length > 0 && (
                  <ul className="flex flex-wrap items-center gap-1" aria-label="Topics">
                    {problem.tags.map((t) => (
                      <li key={t}>
                        <Badge variant="secondary">{t}</Badge>
                      </li>
                    ))}
                    {problem.tagsSource === "auto" && (
                      <li className="text-xs text-muted-foreground" title="Suggested by the AI. Edit the problem to change them.">
                        auto-tagged
                      </li>
                    )}
                  </ul>
                )}
                {problem.sourceUrl && <SourceLink url={problem.sourceUrl} />}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            {runner && (
              <Button
                variant="pen"
                className="mr-2 ring-3 ring-pen-red/25 hover:ring-pen-red/40 shadow-sm"
                onClick={() => setRunnerOpen(true)}
                title={runner.title}
                aria-label="Playground"
                data-tour="edit-run"
              >
                <CodeIcon />
                <span className="hidden sm:inline">Playground</span>
              </Button>
            )}
            <span className="mr-2" data-tour="solution">
              <SolutionButton
                problemId={problem.id}
                problemSlug={problem.slug}
                hasSolution={hasSolution}
                attempt={solutionBase && { id: solutionBase.id, version: solutionBase.version }}
                canGenerate={canRun}
                disabled={Boolean(running)}
              />
            </span>
            <CollapsibleTrigger
              data-tour="statement"
              render={<Button variant="soft" size="sm" className="data-panel-open:[&_svg]:rotate-180" />}
            >
              Statement <ChevronDownIcon className="transition-transform" />
            </CollapsibleTrigger>
            <ProblemActions problem={problem} />
          </div>
        </div>
        <CollapsibleContent>
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border bg-tile p-3 font-sans text-sm whitespace-pre-wrap">
            {problem.statement}
          </pre>
          <div className="mt-3">
            <TestCases problemId={problem.id} initial={problem.harness} language={problem.language} />
          </div>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2" data-tour="attempts">
        {attempts.length > 0 ? (
          <Select
            items={attemptItems}
            value={selectValue}
            disabled={loadingAttempt || Boolean(running)}
            onValueChange={(v) => v && void loadAttempt(v)}
          >
            <SelectTrigger className="w-full" aria-label="Attempts">
              <SelectValue placeholder="New attempt" />
            </SelectTrigger>
            <SelectContent>
              {attemptItems.map((a) => (
                <SelectItem key={a.value} value={a.value}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <span className="flex-1 px-1 text-sm text-muted-foreground">New attempt</span>
        )}
        {mode === "view" && viewing && (
          <Button variant="brand" onClick={requestNewAttempt} disabled={Boolean(running) || loadingAttempt}>
            <CopyPlusIcon /> New attempt
          </Button>
        )}
        {mode === "view" && viewing?.status === "done" && (
          <ShareButton
            key={`share-${viewing.id}`}
            kind="attempt"
            targetId={viewing.id}
            token={viewing.shareToken}
            disabled={Boolean(running) || loadingAttempt}
            onChange={(shareToken) => setViewing((v) => (v?.id === viewing.id ? { ...v, shareToken } : v))}
          />
        )}
        {mode === "view" && viewing && (
          <DeleteAttemptButton
            key={viewing.id}
            attempt={viewing}
            disabled={Boolean(running) || loadingAttempt || IN_PROGRESS.has(viewing.status)}
            onDeleted={() => void onAttemptDeleted(viewing.id)}
          />
        )}
      </div>

      {mode === "view" && viewing && ranOn && (
        <p className="-mt-2 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <CpuIcon className="size-3.5 shrink-0" aria-hidden />
          <span
            className="min-w-0 truncate"
            title={ranOnIsCurrent ? "This attempt has no record of its model, so your current one is shown." : undefined}
          >
            Ran on {PROVIDER_LABELS[ranOn.provider]} · <span className="font-mono">{ranOn.model}</span>
            {ranOnIsCurrent && " (your current model)"}
          </span>
        </p>
      )}

      <Dialog open={confirmingNew} onOpenChange={setConfirmingNew}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start a new attempt?</DialogTitle>
            <DialogDescription>
              Clear the pseudo-code and idea, or keep them from {viewing ? `v${viewing.version}` : "this attempt"} as a
              starting point?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="pen"
              onClick={() => {
                setConfirmingNew(false);
                startNewAttempt(viewing);
              }}
            >
              Keep them
            </Button>
            <Button
              variant="brand"
              onClick={() => {
                setConfirmingNew(false);
                startNewAttempt(viewing, true);
              }}
            >
              Clear them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <form onSubmit={form.handleSubmit(onProcess)} noValidate className="flex flex-col gap-4">
        <Controller
          name="pseudoCode"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} data-tour="pseudo">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <FieldLabel htmlFor="pseudoCode">Pseudo-code</FieldLabel>
                  {mode === "new" && <EditorKeysHint />}
                </div>
                {mode === "new" && (
                  <div className="flex items-center">
                    {uploadsEnabled && <span data-tour="notebook">{notebook.button}</span>}
                    <ClearButton
                      label="Clear pseudo-code"
                      disabled={Boolean(running) || !draftCode?.trim()}
                      onClick={() => form.setValue("pseudoCode", "", { shouldDirty: true })}
                    />
                  </div>
                )}
                {mode === "view" && viewing && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <LockIcon className="size-3 shrink-0" aria-hidden />
                    Read-only · v{viewing.version} · {dateFormat.format(new Date(viewing.createdAt))}
                  </span>
                )}
              </div>
              <CodeEditor
                id="pseudoCode"
                value={shownCode}
                onChange={field.onChange}
                onBlur={field.onBlur}
                readOnly={readOnly}
                invalid={fieldState.invalid}
                maxLength={MAX_TEXT}
                placeholder={"left = 0, right = n - 1\nwhile left < right:\n  ..."}
              />
              {mode === "new" && uploadsEnabled && notebook.thumbnails}
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="idea"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} data-tour="idea">
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="idea">Idea / explanation</FieldLabel>
                {mode === "new" && (
                  <ClearButton
                    label="Clear idea / explanation"
                    disabled={Boolean(running) || !draftIdea?.trim()}
                    onClick={() => form.setValue("idea", "", { shouldDirty: true })}
                  />
                )}
              </div>
              <Textarea
                {...field}
                id="idea"
                value={mode === "view" && viewing ? viewing.idea : field.value}
                readOnly={readOnly}
                maxLength={MAX_TEXT}
                rows={6}
                className="min-h-36 bg-tile"
                placeholder="Why do you think this works? What are you relying on?"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Optional, but it helps pinpoint where your reasoning and your code disagree.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {mode === "view" && viewing && viewing.images.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Notebook photos</span>
            <div className="grid grid-cols-2 gap-2">
              {viewing.images.map((img) =>
                img.url ? (
                  <a key={img.r2Key} href={img.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- public R2 URL */}
                    <img src={img.url} alt="Notebook page" className="aspect-[4/3] w-full object-cover" />
                  </a>
                ) : null,
              )}
            </div>
          </div>
        )}
        {mode === "new" && (
          // Sticks to the bottom of the pane so the main action stays in reach while editing a long attempt.
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t bg-background/90 px-4 py-3 backdrop-blur">
            {canRun ? (
              <LoadingButton
                type="submit"
                variant="brand"
                size="lg"
                loading={Boolean(running)}
                icon={<PlayIcon />}
                data-tour="process"
              >
                {running ? "Processing…" : "Process"}
              </LoadingButton>
            ) : (
              <Link href="/settings" className={buttonVariants({ variant: "brand", size: "lg" })} data-tour="process">
                {aiModel ? "Activate an API key to process" : "Set up an AI provider to process"}
              </Link>
            )}
            {aiModel && canRun && (
              <p className="flex min-w-0 items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <CpuIcon className="size-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 truncate" title={`${PROVIDER_LABELS[aiModel.provider]} · ${aiModel.model}`}>
                  Runs on {PROVIDER_LABELS[aiModel.provider]} · <span className="font-mono">{aiModel.model}</span>
                </span>
                <Link href="/settings" className="shrink-0 underline underline-offset-2 hover:text-foreground">
                  Change
                </Link>
              </p>
            )}
          </div>
        )}
      </form>
      {runner && runnable && (
        <CodeRunner
          open={runnerOpen}
          onOpenChange={setRunnerOpen}
          draftKey={runner.draftKey}
          initialCode={runner.code}
          language={runnable.language}
          view={runnable.view}
          statement={problem.statement}
        />
      )}
    </div>
  );

  let right: React.ReactNode;
  // A finished run's chat: under the run, or in a third column on the right.
  let chat: React.ReactNode = null;
  const sideChat = chatOnSide(chatDock, isDesktop);
  if (running) {
    right = (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-6 p-8" role="status" aria-live="polite">
        <div>
          <h2 className="font-medium">Working on it</h2>
          <p className="text-sm text-muted-foreground">This usually takes under a minute. Keep this tab open until it finishes.</p>
        </div>
        <ProgressStepper status={running.status} details={attemptProgressDetails(running.progress)} />
        <LoadingButton
          variant="destructive"
          className="self-start"
          loading={stopping}
          disabled={!running.attemptId}
          icon={<SquareIcon />}
          onClick={() => void stopRun()}
        >
          {stopping ? "Stopping…" : "Stop processing"}
        </LoadingButton>
      </div>
    );
  } else if (loadingAttempt) {
    right = (
      <div className="flex flex-col gap-3 p-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  } else if (mode === "view" && viewing?.status === "error") {
    right = (
      <div className="p-6">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Processing failed</AlertTitle>
          <AlertDescription>{viewing.error?.message ?? "Something went wrong."}</AlertDescription>
        </Alert>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="soft" onClick={() => startNewAttempt(viewing)}>
            <RotateCcwIcon /> Edit and try again
          </Button>
          <ChangeModelLink />
        </div>
      </div>
    );
  } else if (mode === "view" && viewing?.vizSpec) {
    const spec = viewing.vizSpec;
    const shownCase = Math.min(caseIndex, spec.cases.length - 1);
    const showStep = (ci: number, si: number) => {
      setCaseIndex(ci);
      setPlayerIndex(si);
      setTab("viz");
    };
    chat = (
      <ChatDock
        key={viewing.id}
        dock={chatDock}
        side={sideChat}
        endpoint={`/api/attempts/${viewing.id}/messages`}
        specVersion={viewing.specVersion}
        caseId={spec.cases[shownCase].id}
        stepRefs={stepRefs(spec)}
        selectedStepIds={selectedSteps}
        onToggleStep={toggleStep}
        onClearSelection={() => setSelectedSteps([])}
        onSpecVersion={(v) => void loadAttempt(viewing.id, v)}
      />
    );
    right = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2" data-tour="verdict">
          <VerdictBadge verdict={spec.summary.verdict} />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">{casesPassedText(spec)}</p>
          <UsageBadge attempt={viewing} />
          {spec.summary.verdict !== "works" && (
            <span className="inline-flex" data-tour="fix">
              <FixAttemptButton
                key={`fix-${viewing.id}`}
                problemId={problem.id}
                problemSlug={problem.slug}
                attempt={{ id: viewing.id, version: viewing.version }}
                canGenerate={canRun}
                disabled={Boolean(running) || loadingAttempt}
              />
            </span>
          )}
          {viewing.specVersions.length > 1 && (
            <Select
              items={viewing.specVersions.map((v) => ({ value: String(v.version), label: specLabel(v.version) }))}
              value={String(viewing.specVersion)}
              disabled={loadingAttempt}
              onValueChange={(v) => v && void loadAttempt(viewing.id, Number(v))}
            >
              <SelectTrigger size="sm" aria-label="Visualization version">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {viewing.specVersions.map((v) => (
                  <SelectItem key={v.version} value={String(v.version)}>
                    {specLabel(v.version)}
                    {v.version > 1 && <span className="text-muted-foreground"> · {v.reason}</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <Tabs value={tab} onValueChange={(v) => setTab(String(v))}>
          <TabsList data-tour="tabs">
            <TabsTrigger value="viz">Visualization</TabsTrigger>
            <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
            <TabsTrigger value="hints">Hints</TabsTrigger>
          </TabsList>
          <TabsContent value="viz" className="flex flex-col gap-3 pt-3">
            <div data-tour="cases">
              <CaseBar spec={spec} caseIndex={shownCase} onCaseChange={(ci) => showStep(ci, 0)} gives="Your code gives" />
            </div>
            <div data-tour="player">
              <Player
                key={`${viewing.id}-${viewing.specVersion}-${shownCase}`}
                spec={caseView(spec, shownCase)}
                language={problem.language}
                index={playerIndex}
                onIndexChange={setPlayerIndex}
                layoutId={viewing.id}
                selectedStepIds={new Set(selectedSteps)}
                onToggleStepSelect={toggleStep}
              />
            </div>
          </TabsContent>
          <TabsContent value="diagnosis" className="pt-3">
            <DiagnosisPanel key={`${viewing.id}-${viewing.specVersion}`} spec={spec} onJumpToStep={showStep} />
          </TabsContent>
          <TabsContent value="hints" className="pt-3">
            <HintsPanel key={`${viewing.id}-${viewing.specVersion}`} spec={spec} onJumpToStep={showStep} />
          </TabsContent>
        </Tabs>
        {!sideChat && chat}
      </div>
    );
  } else if (failure) {
    right = (
      <div className="flex flex-col gap-4 p-6">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>That run failed, so nothing was saved</AlertTitle>
          <AlertDescription>
            {failure} Your pseudo-code and idea are still on the left. Press Process to try again.
          </AlertDescription>
        </Alert>
        <div>
          <ChangeModelLink newTab />
        </div>
      </div>
    );
  } else {
    right = (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <SparklesIcon className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Write your approach, then press Process</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Your pseudo-code is run on a small input and animated step by step, with the point where it goes wrong
            marked in red.
          </p>
        </div>
        <ol className="flex max-w-sm list-inside list-decimal flex-col gap-1 text-left text-sm text-muted-foreground marker:text-brand-strong">
          <li>Paste or type your pseudo-code.</li>
          <li>Add the idea behind it, if you can. It helps pinpoint where your reasoning and code disagree.</li>
          <li>Step through the animation, then read the diagnosis.</li>
        </ol>
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col bg-paper">
        {left}
        <div ref={resultsRef} className="scroll-mt-14 border-t">
          {right}
        </div>
      </div>
    );
  }

  const sizes = splitSizes(sideChat && chat !== null);

  return (
    // Inline style, because the library's own inline `height: 100%` would beat a height class. The extra 1px is
    // the header's bottom border.
    <ResizablePanelGroup orientation="horizontal" style={{ height: "calc(100dvh - 3.5rem - 1px)" }}>
      <ResizablePanel id="left" defaultSize={sizes.left} minSize="25%" className="overflow-y-auto bg-paper">
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel id="right" defaultSize={sizes.right} minSize="35%" className="overflow-y-auto bg-paper">
        {right}
      </ResizablePanel>
      {sideChat && chat !== null && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="chat" defaultSize={sizes.chat} minSize="18%" className="bg-tile">
            {chat}
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );
}
