"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  ChevronDownIcon,
  CopyPlusIcon,
  CpuIcon,
  EraserIcon,
  ExternalLinkIcon,
  LockIcon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
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
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { HintsPanel } from "@/components/viz/HintsPanel";
import { Player } from "@/components/viz/Player";
import { LoadingButton } from "@/components/loading-button";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { DeleteAttemptButton } from "@/components/workspace/DeleteAttemptButton";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { useNotebookUpload, type UploadedImage } from "@/components/workspace/NotebookUpload";
import { ProblemActions } from "@/components/workspace/ProblemActions";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { UsageBadge } from "@/components/workspace/UsageBadge";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { AttemptDetail, AttemptSummary } from "@/lib/attempts";
import { ApiClientError, api, apiRaw, toApiError } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { PROVIDER_LABELS, type ProviderId } from "@/lib/providers";
import { createAttemptSchema, type CreateAttemptInput } from "@/lib/schemas/attempts";
import { MAX_TEXT } from "@/lib/schemas/problems";
import { readSSE } from "@/lib/sse";
import { VERDICT_LABELS } from "@/lib/verdicts";
import type { AttemptStatus } from "@/models/Attempt";

type StreamEvent =
  | { type: "attempt"; attemptId: string; version: number }
  | { type: "status"; status: AttemptStatus }
  | { type: "done"; attemptId: string }
  | { type: "error"; code: string; message: string; discarded?: boolean };

const IN_PROGRESS = new Set<AttemptStatus>(["queued", "extracting", "understanding", "tracing", "diagnosing"]);

/** Attempts already use "v1, v2"; regenerated visualizations get their own wording. */
const specLabel = (version: number) => (version === 1 ? "Original visualization" : `Regenerated #${version - 1}`);

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });

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
}: {
  problem: ProblemDetail;
  initialAttempts: AttemptSummary[];
  initialAttempt: AttemptDetail | null;
  /** The provider and model new attempts will use. */
  aiModel: { provider: ProviderId; model: string } | null;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [viewing, setViewing] = useState<AttemptDetail | null>(initialAttempt);
  const [mode, setMode] = useState<"new" | "view">(initialAttempt ? "view" : "new");
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [running, setRunning] = useState<{ attemptId: string | null; status: AttemptStatus } | null>(
    initialAttempt && IN_PROGRESS.has(initialAttempt.status)
      ? { attemptId: initialAttempt.id, status: initialAttempt.status }
      : null,
  );
  const [streaming, setStreaming] = useState(false);
  /** Why the last run produced nothing. Such a run isn't kept as an attempt, so it's explained in the results pane. */
  const [failure, setFailure] = useState<string | null>(null);
  const [playerIndex, setPlayerIndex] = useState(0);
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
          setRunning({ attemptId, status: attempt.status });
          return;
        }
        clearInterval(timer);
        setRunning(null);
        notifyFinished(attempt);
        setViewing(attempt);
        setMode("view");
        setPlayerIndex(0);
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
          setFailure("The run didn't finish.");
          router.refresh();
        }
        // Otherwise keep polling; transient failures are fine.
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running?.attemptId, streaming, router]);

  /** Drops a failed run that the server discarded and returns to the editable draft. */
  function discardRun(attemptId: string | null, message: string) {
    setRunning(null);
    setAttempts((list) => list.filter((a) => a.id !== attemptId));
    setViewing((v) => (v?.id === attemptId ? null : v));
    setMode("new");
    setFailure(message);
    router.refresh();
  }

  function notifyFinished(attempt: AttemptDetail) {
    if (attempt.status === "error") toast.error(attempt.error?.message ?? "Processing failed.");
    else if (attempt.verdict === "works") toast.success("Analysis ready: your approach works on this input.");
    else toast.success("Analysis ready. Step through it to see where it breaks.");
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
          setRunning({ attemptId, status: e.status });
        } else if (e.type === "done") {
          finished = true;
          setRunning(null);
          const attempt = await loadAttempt(e.attemptId);
          if (attempt) notifyFinished(attempt);
          router.refresh();
        } else if (e.type === "error") {
          finished = true;
          if (e.discarded) {
            // Nothing was saved: the learner stays on their draft and can press Process again.
            discardRun(attemptId, e.message);
          } else {
            setRunning(null);
            if (attemptId) await loadAttempt(attemptId);
          }
          toast.error(e.message);
        }
      }
    } catch (err) {
      finished = !attemptId;
      if (!attemptId) setRunning(null);
      toast.error(err instanceof Error ? err.message : "Couldn't start processing.");
    } finally {
      setStreaming(false);
      // Stream dropped mid-run: the polling effect takes over.
      if (!finished && attemptId) setRunning({ attemptId, status: "tracing" });
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
  const ranOnIsCurrent = !viewing?.model;
  // While drafting a new attempt nothing is selected; the trigger shows a placeholder instead.
  const selectValue = mode === "new" ? null : (viewing?.id ?? null);
  const attemptItems = attempts.map((a) => ({
    value: a.id,
    label: `v${a.version} · ${a.verdict ? VERDICT_LABELS[a.verdict] : IN_PROGRESS.has(a.status) ? "processing" : a.status === "error" ? "failed" : "…"} · ${shortDate.format(new Date(a.createdAt))}`,
  }));

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
                {problem.sourceUrl && (
                  <a
                    href={problem.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <span className="truncate">{new URL(problem.sourceUrl).hostname.replace(/^www\./, "")}</span>
                    <ExternalLinkIcon className="size-3 shrink-0" aria-hidden />
                    <span className="sr-only">(opens in a new tab)</span>
                  </a>
                )}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center">
            <CollapsibleTrigger
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
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2">
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
              variant="soft"
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
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-center justify-between gap-2">
                <FieldLabel htmlFor="pseudoCode">Pseudo-code</FieldLabel>
                {mode === "new" && (
                  <div className="flex items-center">
                    {uploadsEnabled && notebook.button}
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
            <Field data-invalid={fieldState.invalid}>
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
            {aiModel ? (
              <LoadingButton type="submit" variant="brand" size="lg" loading={Boolean(running)} icon={<PlayIcon />}>
                {running ? "Processing…" : "Process"}
              </LoadingButton>
            ) : (
              <Link href="/settings" className={buttonVariants({ variant: "brand", size: "lg" })}>
                Set up an AI provider to process
              </Link>
            )}
            {aiModel && (
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
    </div>
  );

  let right: React.ReactNode;
  if (running) {
    right = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8" role="status" aria-live="polite">
        <div>
          <h2 className="font-medium">Working on it</h2>
          <p className="text-sm text-muted-foreground">This usually takes under a minute. Keep this tab open until it finishes.</p>
        </div>
        <ProgressStepper status={running.status} />
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
        <Button className="mt-4" variant="soft" onClick={() => startNewAttempt(viewing)}>
          <RotateCcwIcon /> Edit and try again
        </Button>
      </div>
    );
  } else if (mode === "view" && viewing?.vizSpec) {
    const spec = viewing.vizSpec;
    right = (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <VerdictBadge verdict={spec.summary.verdict} />
          <p className="min-w-0 flex-1 text-sm text-muted-foreground">
            Input: <span className="font-mono text-foreground">{spec.summary.testInputDescription}</span>
          </p>
          <UsageBadge attempt={viewing} />
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
          <TabsList>
            <TabsTrigger value="viz">Visualization</TabsTrigger>
            <TabsTrigger value="diagnosis">Diagnosis</TabsTrigger>
            <TabsTrigger value="hints">Hints</TabsTrigger>
          </TabsList>
          <TabsContent value="viz" className="pt-3">
            <Player
              key={`${viewing.id}-${viewing.specVersion}`}
              spec={spec}
              index={playerIndex}
              onIndexChange={setPlayerIndex}
              layoutId={viewing.id}
              selectedStepIds={new Set(selectedSteps)}
              onToggleStepSelect={toggleStep}
            />
          </TabsContent>
          <TabsContent value="diagnosis" className="pt-3">
            <DiagnosisPanel
              key={`${viewing.id}-${viewing.specVersion}`}
              spec={spec}
              onJumpToStep={(i) => {
                setPlayerIndex(i);
                setTab("viz");
              }}
            />
          </TabsContent>
          <TabsContent value="hints" className="pt-3">
            <HintsPanel
              key={`${viewing.id}-${viewing.specVersion}`}
              spec={spec}
              onJumpToStep={(i) => {
                setPlayerIndex(i);
                setTab("viz");
              }}
            />
          </TabsContent>
        </Tabs>
        <ChatPanel
          key={viewing.id}
          attemptId={viewing.id}
          specVersion={viewing.specVersion}
          steps={spec.steps}
          selectedStepIds={selectedSteps}
          onToggleStep={toggleStep}
          onClearSelection={() => setSelectedSteps([])}
          onSpecVersion={(v) => void loadAttempt(viewing.id, v)}
        />
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

  return (
    // Inline style, because the library's own inline `height: 100%` would beat a height class. The extra 1px is
    // the header's bottom border.
    <ResizablePanelGroup orientation="horizontal" style={{ height: "calc(100dvh - 3.5rem - 1px)" }}>
      <ResizablePanel defaultSize="38%" minSize="25%" className="overflow-y-auto bg-paper">
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="62%" minSize="35%" className="overflow-y-auto bg-paper">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
