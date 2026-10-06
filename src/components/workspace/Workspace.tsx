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
  Loader2Icon,
  PlayIcon,
  RotateCcwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { cn } from "cn";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { DiagnosisPanel } from "@/components/viz/DiagnosisPanel";
import { Player } from "@/components/viz/Player";
import { ChatPanel } from "@/components/workspace/ChatPanel";
import { CodeEditor } from "@/components/workspace/CodeEditor";
import { ImageDropzone, type UploadedImage } from "@/components/workspace/ImageDropzone";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { AttemptDetail, AttemptSummary } from "@/lib/attempts";
import { api, apiRaw, toApiError } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { createAttemptSchema, type CreateAttemptInput } from "@/lib/schemas/attempts";
import { MAX_TEXT } from "@/lib/schemas/problems";
import { readSSE } from "@/lib/sse";
import { VERDICT_LABELS } from "@/lib/verdicts";
import type { AttemptStatus } from "@/models/Attempt";

type StreamEvent =
  | { type: "attempt"; attemptId: string; version: number }
  | { type: "status"; status: AttemptStatus }
  | { type: "done"; attemptId: string }
  | { type: "error"; code: string; message: string };

const IN_PROGRESS = new Set<AttemptStatus>(["queued", "extracting", "understanding", "tracing", "diagnosing"]);
const NEW = "new";

/** Attempts already use "v1, v2"; regenerated visualizations get their own wording. */
const specLabel = (version: number) => (version === 1 ? "Original visualization" : `Regenerated #${version - 1}`);

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export function Workspace({
  problem,
  initialAttempts,
  initialAttempt,
  hasProvider,
  uploadsEnabled,
}: {
  problem: ProblemDetail;
  initialAttempts: AttemptSummary[];
  initialAttempt: AttemptDetail | null;
  hasProvider: boolean;
  uploadsEnabled: boolean;
}) {
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [attempts, setAttempts] = useState(initialAttempts);
  const [viewing, setViewing] = useState<AttemptDetail | null>(initialAttempt);
  const [mode, setMode] = useState<"new" | "view">(initialAttempt ? "view" : "new");
  const [loadingAttempt, setLoadingAttempt] = useState(false);
  const [running, setRunning] = useState<{ attemptId: string | null; status: AttemptStatus } | null>(
    initialAttempt && IN_PROGRESS.has(initialAttempt.status)
      ? { attemptId: initialAttempt.id, status: initialAttempt.status }
      : null,
  );
  const [streaming, setStreaming] = useState(false);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [tab, setTab] = useState("viz");
  const [selectedSteps, setSelectedSteps] = useState<string[]>([]);
  const toggleStep = (id: string) =>
    setSelectedSteps((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id].slice(-8)));
  const pollToken = useRef(0);

  const form = useForm<CreateAttemptInput>({
    resolver: zodResolver(createAttemptSchema),
    defaultValues: { pseudoCode: initialAttempt?.pseudoCode ?? "", idea: initialAttempt?.idea ?? "", images: [] },
  });

  async function loadAttempt(attemptId: string, specVersion?: number) {
    setLoadingAttempt(true);
    try {
      const query = specVersion ? `?specVersion=${specVersion}` : "";
      const { attempt } = await api<{ attempt: AttemptDetail }>(`/api/attempts/${attemptId}${query}`);
      setViewing(attempt);
      setMode("view");
      setPlayerIndex(0);
      setTab("viz");
      setSelectedSteps([]);
      setAttempts((list) => list.map((a) => (a.id === attempt.id ? { ...a, status: attempt.status, verdict: attempt.verdict } : a)));
      return attempt;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load that attempt.");
      return null;
    } finally {
      setLoadingAttempt(false);
    }
  }

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
        setViewing(attempt);
        setMode("view");
        setPlayerIndex(0);
        setAttempts((list) => list.map((a) => (a.id === attempt.id ? { ...a, status: attempt.status, verdict: attempt.verdict } : a)));
        router.refresh();
      } catch {
        // keep polling; transient failures are fine
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [running?.attemptId, streaming, router]);

  async function onProcess(values: CreateAttemptInput) {
    setRunning({ attemptId: null, status: "queued" });
    setStreaming(true);
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
          await loadAttempt(e.attemptId);
          router.refresh();
        } else if (e.type === "error") {
          finished = true;
          setRunning(null);
          if (attemptId) await loadAttempt(attemptId);
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

  function startNewAttempt(prefill?: AttemptDetail | null) {
    const source = prefill ?? viewing;
    form.reset({ pseudoCode: source?.pseudoCode ?? "", idea: source?.idea ?? "", images: [] });
    setMode("new");
  }

  const readOnly = mode === "view" || Boolean(running);
  const draftCode = useWatch({ control: form.control, name: "pseudoCode" });
  const shownCode = mode === "view" && viewing ? viewing.pseudoCode : draftCode;
  const selectValue = mode === "new" ? NEW : (viewing?.id ?? NEW);
  const attemptItems = [
    { value: NEW, label: "New attempt" },
    ...attempts.map((a) => ({
      value: a.id,
      label: `v${a.version} · ${a.verdict ? VERDICT_LABELS[a.verdict] : IN_PROGRESS.has(a.status) ? "processing" : a.status === "error" ? "failed" : "…"}`,
    })),
  ];

  const left = (
    <div className="flex flex-col gap-4 p-4">
      <Collapsible defaultOpen={!initialAttempt}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">{problem.title}</h1>
            {problem.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {problem.tags.map((t) => (
                  <Badge key={t} variant="secondary">
                    {t}
                  </Badge>
                ))}
                {problem.tagsSource === "auto" && <span className="text-xs text-muted-foreground">auto-tagged</span>}
              </div>
            )}
          </div>
          <CollapsibleTrigger
            render={<Button variant="ghost" size="sm" className="shrink-0 data-panel-open:[&_svg]:rotate-180" />}
          >
            Statement <ChevronDownIcon className="transition-transform" />
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <pre className="mt-3 max-h-64 overflow-auto rounded-lg border bg-muted/30 p-3 font-sans text-sm whitespace-pre-wrap">
            {problem.statement}
          </pre>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex items-center gap-2">
        <Select
          items={attemptItems}
          value={selectValue}
          onValueChange={(v) => {
            if (!v) return;
            if (v === NEW) startNewAttempt();
            else void loadAttempt(v);
          }}
        >
          <SelectTrigger className="w-full" aria-label="Attempts">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {attemptItems.map((a) => (
              <SelectItem key={a.value} value={a.value}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {mode === "view" && viewing && (
          <Button variant="outline" onClick={() => startNewAttempt(viewing)} disabled={Boolean(running)}>
            <CopyPlusIcon /> New attempt
          </Button>
        )}
      </div>

      <form onSubmit={form.handleSubmit(onProcess)} noValidate className="flex flex-col gap-4">
        <Controller
          name="pseudoCode"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <div className="flex items-baseline justify-between">
                <FieldLabel htmlFor="pseudoCode">Pseudo-code</FieldLabel>
                {mode === "view" && viewing && (
                  <span className="text-xs text-muted-foreground">
                    v{viewing.version} · {dateFormat.format(new Date(viewing.createdAt))} · read-only
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
                placeholder={"left = 0, right = n - 1\nwhile left < right:\n    ..."}
                className="h-64"
              />
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <Controller
          name="idea"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="idea">Idea / explanation</FieldLabel>
              <Textarea
                {...field}
                id="idea"
                value={mode === "view" && viewing ? viewing.idea : field.value}
                readOnly={readOnly}
                maxLength={MAX_TEXT}
                rows={4}
                placeholder="Why do you think this works? What are you relying on?"
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>Optional, but it helps pinpoint where your reasoning and your code disagree.</FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        {mode === "new" && uploadsEnabled && (
          <Controller
            name="images"
            control={form.control}
            render={({ field }) => (
              <Field>
                <FieldLabel>Notebook photos</FieldLabel>
                <ImageDropzone
                  problemId={problem.id}
                  images={(field.value ?? []) as UploadedImage[]}
                  onChange={field.onChange}
                  disabled={Boolean(running)}
                  onExtracted={({ pseudoCode, notes }) => {
                    const { pseudoCode: code, idea } = form.getValues();
                    // Append rather than overwrite: never lose what the learner already typed.
                    const join = (a: string | undefined, b: string) => (a?.trim() ? `${a.trimEnd()}\n\n${b}` : b);
                    form.setValue("pseudoCode", join(code, pseudoCode), { shouldDirty: true });
                    if (notes.trim()) form.setValue("idea", join(idea, notes), { shouldDirty: true });
                  }}
                />
                <FieldDescription>The transcription lands in the editor above so you can fix anything misread.</FieldDescription>
              </Field>
            )}
          />
        )}
        {mode === "view" && viewing && viewing.images.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Notebook photos</span>
            <div className="grid grid-cols-2 gap-2">
              {viewing.images.map((img) =>
                img.url ? (
                  <a key={img.r2Key} href={img.url} target="_blank" rel="noreferrer" className="overflow-hidden rounded-lg border">
                    {/* eslint-disable-next-line @next/next/no-img-element -- presigned R2 URL */}
                    <img src={img.url} alt="Notebook page" className="aspect-[4/3] w-full object-cover" />
                  </a>
                ) : null,
              )}
            </div>
          </div>
        )}
        {mode === "new" &&
          (hasProvider ? (
            <Button type="submit" size="lg" disabled={Boolean(running)}>
              {running ? <Loader2Icon className="animate-spin" /> : <PlayIcon />}
              {running ? "Processing…" : "Process"}
            </Button>
          ) : (
            <Link href="/settings" className={buttonVariants({ size: "lg" })}>
              Set up an AI provider to process
            </Link>
          ))}
      </form>
    </div>
  );

  let right: React.ReactNode;
  if (running) {
    right = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
        <div>
          <h2 className="font-medium">Working on it</h2>
          <p className="text-sm text-muted-foreground">This usually takes under a minute. You can leave this page.</p>
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
        <Button className="mt-4" variant="outline" onClick={() => startNewAttempt(viewing)}>
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
          {viewing.specVersions.length > 1 && (
            <Select
              items={viewing.specVersions.map((v) => ({ value: String(v.version), label: specLabel(v.version) }))}
              value={String(viewing.specVersion)}
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
  } else {
    right = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
        <SparklesIcon className="size-6 text-muted-foreground" />
        <p className="font-medium">Write your approach, then press Process</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Your pseudo-code is run on a small input and animated step by step, with the point where it goes wrong
          marked in red.
        </p>
      </div>
    );
  }

  if (!isDesktop) {
    return (
      <div className="flex flex-col">
        {left}
        <div className="border-t">{right}</div>
      </div>
    );
  }

  return (
    <ResizablePanelGroup orientation="horizontal" className="h-[calc(100dvh-3.5rem)]">
      <ResizablePanel defaultSize="38%" minSize="25%" className={cn("overflow-y-auto")}>
        {left}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize="62%" minSize="35%" className="overflow-y-auto">
        {right}
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
