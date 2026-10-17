"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, PresentationIcon, RotateCcwIcon, SquareIcon, TriangleAlertIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChangeModelLink } from "@/components/workspace/ChangeModelLink";
import { ProgressStepper } from "@/components/workspace/ProgressStepper";
import { solutionProgressDetails } from "@/components/workspace/RunProgressDetails";
import { api } from "@/lib/fetcher";
import type { LessonDetail } from "@/lib/lessons";
import type { ProblemDetail } from "@/lib/problems";
import { problemPath } from "@/lib/slug";
import { playCompletionSound } from "@/lib/sounds";
import type { LessonStatus } from "@/models/Lesson";
import { SlideDeck } from "./SlideDeck";

const IN_PROGRESS = new Set<LessonStatus>(["queued", "solving", "tracing", "writing"]);

const STAGES = [
  { status: "solving", label: "Working out an approach", detail: "Finding a correct way to solve it" },
  { status: "tracing", label: "Running it on the examples", detail: "Recording every state, to draw the pictures from" },
  { status: "writing", label: "Making the slides", detail: "Choosing the moments to show and explaining them" },
];
const ORDER = ["queued", "solving", "tracing", "writing", "done"];

export function LessonView({
  problem,
  initialLesson,
  canGenerate,
}: {
  problem: ProblemDetail;
  initialLesson: LessonDetail | null;
  /** False when no AI provider (or key) is set up. */
  canGenerate: boolean;
}) {
  const [lesson, setLesson] = useState(initialLesson);
  const [busy, setBusy] = useState<"start" | "stop" | "rebuild" | null>(null);
  const [confirmRebuild, setConfirmRebuild] = useState(false);
  const problemHref = problemPath(problem);
  const url = `/api/problems/${problem.id}/lesson`;

  // While it's being built, follow it until it settles.
  const running = Boolean(lesson && IN_PROGRESS.has(lesson.status));
  useEffect(() => {
    if (!running) return;
    const abort = new AbortController();
    const timer = setInterval(async () => {
      try {
        const { lesson: now } = await api<{ lesson: LessonDetail | null }>(url, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setLesson(now);
        if (now?.status === "done") {
          playCompletionSound();
          toast.success("Your breakdown is ready.");
        }
      } catch {
        // Transient; the next tick tries again.
      }
    }, 2500);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [running, url]);

  async function start() {
    setBusy("start");
    try {
      const { lesson: created } = await api<{ lesson: LessonDetail }>(url, { method: "POST" });
      setLesson(created);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the breakdown.");
    } finally {
      setBusy(null);
    }
  }

  async function stop() {
    setBusy("stop");
    try {
      await api(url, { method: "DELETE" });
      setLesson(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't stop it.");
    } finally {
      setBusy(null);
    }
  }

  async function rebuild() {
    setBusy("rebuild");
    try {
      await api(url, { method: "DELETE" });
      setLesson(null);
      const { lesson: created } = await api<{ lesson: LessonDetail }>(url, { method: "POST" });
      setLesson(created);
      setConfirmRebuild(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rebuild the breakdown.");
    } finally {
      setBusy(null);
    }
  }

  const spec = lesson?.status === "done" ? lesson.spec : null;

  let body: React.ReactNode;
  if (!lesson) {
    body = (
      <div className="m-auto flex max-w-md flex-col items-center gap-5 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
          <PresentationIcon className="size-6" aria-hidden />
        </span>
        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-medium">Learn how to think about it</h2>
          <p className="text-sm text-muted-foreground">
            A short set of slides that starts from the statement and works up to the idea that solves it, with
            animated pictures of the data and no code. It&apos;s saved, so opening it again costs nothing.
          </p>
        </div>
        <LoadingButton variant="marker" size="lg" loading={busy === "start"} disabled={!canGenerate} onClick={() => void start()}>
          {busy === "start" ? "Starting…" : "Build the breakdown"}
        </LoadingButton>
        {!canGenerate && (
          <p className="text-xs text-muted-foreground">
            Set up an AI provider in{" "}
            <Link href="/settings" className="underline underline-offset-2">
              Settings
            </Link>{" "}
            first.
          </p>
        )}
      </div>
    );
  } else if (IN_PROGRESS.has(lesson.status)) {
    body = (
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8" role="status" aria-live="polite">
        <div>
          <h2 className="font-medium">Building your breakdown</h2>
          <p className="text-sm text-muted-foreground">
            This usually takes a minute or two. You can leave this page; it&apos;ll be here when you come back.
          </p>
        </div>
        <ProgressStepper status={lesson.status} stages={STAGES} order={ORDER} details={solutionProgressDetails(lesson.progress)} />
        <LoadingButton variant="destructive" className="self-start" loading={busy === "stop"} icon={<SquareIcon />} onClick={() => void stop()}>
          {busy === "stop" ? "Stopping…" : "Stop"}
        </LoadingButton>
      </div>
    );
  } else if (lesson.status === "error" || !spec) {
    body = (
      <div className="mx-auto flex w-full max-w-xl flex-col items-start gap-4">
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>Building the breakdown failed</AlertTitle>
          <AlertDescription>{lesson.error?.message ?? "Something went wrong."}</AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-2">
          <LoadingButton variant="soft" loading={busy === "start"} disabled={!canGenerate} onClick={() => void start()}>
            <RotateCcwIcon /> Try again
          </LoadingButton>
          <ChangeModelLink />
        </div>
      </div>
    );
  } else {
    body = <SlideDeck key={lesson.id} spec={spec} problemHref={problemHref} />;
  }

  return (
    <div className="flex flex-1 flex-col bg-graph-subtle">
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <Link
              href={problemHref}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeftIcon className="size-4" /> {problem.title}
            </Link>
            <h1 className="text-xl font-semibold tracking-tight">
              Breakdown
              {spec &&<span className="font-normal text-muted-foreground"> · {spec.approach.name}</span>}
            </h1>
          </div>
          {spec && (
            <Button variant="ghost" size="sm" onClick={() => setConfirmRebuild(true)} disabled={!canGenerate || busy !== null}>
              <RotateCcwIcon /> Build again
            </Button>
          )}
        </div>
        {body}
      </div>

      <Dialog open={confirmRebuild} onOpenChange={(o) => !o && busy !== "rebuild" && setConfirmRebuild(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Build the breakdown again?</DialogTitle>
            <DialogDescription>
              This replaces the current slides with new ones. It uses your AI provider again, and the current slides
              can&apos;t be brought back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRebuild(false)} disabled={busy === "rebuild"}>
              Cancel
            </Button>
            <LoadingButton variant="marker" loading={busy === "rebuild"} onClick={() => void rebuild()}>
              {busy === "rebuild" ? "Starting…" : "Build again"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
