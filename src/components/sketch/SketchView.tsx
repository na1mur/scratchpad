"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeftIcon, CheckIcon, CloudAlertIcon, Loader2Icon, PanelRightCloseIcon, PanelRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PublicTestCase } from "@/lib/harness/types";
import type { ProblemDetail } from "@/lib/problems";
import { suggestedKinds } from "@/lib/sketch/palette";
import { seedFromCase, type ReadyHarnessView } from "@/lib/sketch/seed";
import type { SketchElement } from "@/lib/sketch/types";
import { problemPath } from "@/lib/slug";
import { CanvasToolbar } from "./CanvasToolbar";
import { insertElements } from "./commands";
import { ImageLibrary } from "./ImageLibrary";
import { Palette } from "./Palette";
import { SketchActions } from "./SketchActions";
import { SketchCanvas } from "./SketchCanvas";
import { SketchStore, useSketch, type SaveStatus } from "./store";

function SaveState({ status, error }: { status: SaveStatus; error: string | null }) {
  const common = "flex items-center gap-1.5 text-xs text-muted-foreground";
  if (status === "error") {
    return (
      <span className={`${common} text-destructive`} title={error ?? undefined} role="status">
        <CloudAlertIcon className="size-3.5" /> Not saved{error ? `: ${error}` : ""}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className={common} role="status">
        <CheckIcon className="size-3.5" /> Saved
      </span>
    );
  }
  if (status === "pending") {
    return (
      <span className={common} role="status" title="Saved every 30 seconds and when you leave. Ctrl+S saves now.">
        <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden /> Unsaved changes
      </span>
    );
  }
  return (
    <span className={common} role="status">
      <Loader2Icon className="size-3.5 animate-spin" /> Saving…
    </span>
  );
}

/**
 * The sketch page: the palette on the left, the canvas, and the statement and test cases on the right. Phones
 * get the canvas read-only (pan and zoom), since dragging structures around needs a pointer.
 */
export function SketchView({
  problem,
  initialElements,
  initialGrid,
}: {
  problem: ProblemDetail;
  initialElements: SketchElement[];
  initialGrid: boolean;
}) {
  const [store] = useState(() => new SketchStore(problem.id, initialElements, initialGrid));
  const s = useSketch(store);
  const desktop = useMediaQuery("(min-width: 768px)", true);
  const readOnly = !desktop;
  const [panelOpen, setPanelOpen] = useState(true);
  const [sideTab, setSideTab] = useState<"elements" | "images">("elements");
  const harness = problem.harness.status === "ready" ? (problem.harness as ReadyHarnessView) : null;
  const suggested = suggestedKinds(problem.harness, problem.tags);

  // Changes are saved on an interval (store.ts); whatever is left goes out as the page is left, and leaving
  // goes ahead without asking.
  useEffect(() => {
    const save = () => void store.flushOnLeave();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") save();
      else void store.refresh();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Only a save too large to send while unloading needs the learner to wait for it.
      if (!store.flushOnLeave()) e.preventDefault();
    };
    window.addEventListener("pagehide", save);
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", save);
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibility);
      // Leaving for another page of the app, or going back.
      save();
    };
  }, [store]);

  const startFrom = (c: PublicTestCase) => {
    if (!harness) return;
    const { elements, cut } = seedFromCase(harness, c);
    if (!elements.length) {
      toast.error("This case couldn't be laid out.");
      return;
    }
    insertElements(store, elements);
    if (cut.length) toast(`Only the first values of ${cut.join(", ")} fit on the canvas.`);
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 3.5rem - 1px)" }}>
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-3">
        <Link href={problemPath(problem)} className={buttonVariants({ variant: "ghost", size: "sm", className: "min-w-0" })}>
          <ArrowLeftIcon />
          <span className="truncate">{problem.title}</span>
        </Link>
        <h1 className="sr-only">Sketch of {problem.title}</h1>
        <div className="ml-auto flex items-center gap-3">
          <SaveState status={s.save} error={s.saveError} />
          <SketchActions store={store} problem={problem} />
          {desktop && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setPanelOpen((o) => !o)}
              aria-label={panelOpen ? "Hide the problem" : "Show the problem"}
              title={panelOpen ? "Hide the problem" : "Show the problem"}
              aria-expanded={panelOpen}
            >
              {panelOpen ? <PanelRightCloseIcon /> : <PanelRightIcon />}
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {desktop && (
          <aside className="flex w-52 shrink-0 flex-col overflow-y-auto border-r bg-background p-2">
            <div role="tablist" aria-label="Sidebar" className="mb-2 grid grid-cols-2 gap-0.5 rounded-lg bg-muted p-0.5">
              {(["elements", "images"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`sketch-side-${tab}`}
                  aria-selected={sideTab === tab}
                  aria-controls="sketch-side-panel"
                  onClick={() => setSideTab(tab)}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium text-muted-foreground focus-visible:ring-2 focus-visible:ring-brand focus-visible:outline-none",
                    sideTab === tab ? "bg-background text-foreground shadow-sm" : "hover:text-foreground",
                  )}
                >
                  {tab === "elements" ? "Elements" : "Images"}
                </button>
              ))}
            </div>
            <div id="sketch-side-panel" role="tabpanel" aria-labelledby={`sketch-side-${sideTab}`} className="min-h-0 flex-1">
              {sideTab === "elements" ? <Palette store={store} suggested={suggested} /> : <ImageLibrary store={store} />}
            </div>
          </aside>
        )}

        <main className="relative min-w-0 flex-1">
          <SketchCanvas store={store} readOnly={readOnly} />
          <CanvasToolbar store={store} readOnly={readOnly} />
          {readOnly && (
            <p className="absolute top-3 right-3 left-3 z-20 rounded-lg border bg-popover p-2 text-center text-xs text-muted-foreground shadow-sm">
              Editing a sketch needs a larger screen. You can pan and zoom here.
            </p>
          )}
        </main>

        {desktop && panelOpen && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l bg-background p-4" aria-label="Problem">
            <h2 className="text-sm font-medium">Statement</h2>
            <pre className="mt-2 max-h-80 overflow-auto rounded-lg border bg-tile p-3 font-sans text-sm whitespace-pre-wrap">
              {problem.statement}
            </pre>
            <h2 className="mt-5 text-sm font-medium">Test cases</h2>
            {harness ? (
              <ul className="mt-2 flex flex-col gap-2">
                {harness.cases.map((c, i) => (
                  <li key={i} className="rounded-lg border bg-tile p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-medium">{c.label || `Case ${i + 1}`}</span>
                      <Button variant="soft" size="xs" onClick={() => startFrom(c)} title="Lay out this case's input on the canvas">
                        Start from
                      </Button>
                    </div>
                    <p className="mt-1.5 font-mono text-xs break-all text-muted-foreground">{c.input}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {problem.harness.status === "building" ? "The test cases are still being prepared." : "This problem has no fixed test cases."}
              </p>
            )}
          </aside>
        )}
      </div>
    </div>
  );
}
