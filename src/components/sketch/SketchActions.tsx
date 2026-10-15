"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageDownIcon, Loader2Icon, ScanTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ApiClientError, api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { leaveSketchReading, sketchOutline, type SketchReading } from "@/lib/sketch/reading";
import { problemPath } from "@/lib/slug";
import { selectedWithLinks } from "./commands";
import { captureForReading, captureSketch, downloadBlob } from "./exportImage";
import { useSketch, type SketchStore } from "./store";

/** Saves the sketch, or the selection, as a PNG at twice the size, on its graph paper or transparent. */
function ExportMenu({ store, problem }: { store: SketchStore; problem: ProblemDetail }) {
  const s = useSketch(store);
  const [background, setBackground] = useState(true);
  const [busy, setBusy] = useState(false);
  const hasSelection = [...s.selection].some((id) => s.elements.get(id)?.type !== "link");

  async function exportPng(part: "all" | "selection") {
    setBusy(true);
    try {
      const { elements, selection } = store.state;
      const only = part === "selection" ? new Set(selectedWithLinks(elements, selection).map((el) => el.id)) : undefined;
      const blob = await captureSketch(store, { only, backdrop: background ? "grid" : "none", theme: "page", scale: 2 });
      if (!blob) {
        toast.error("There's nothing to export yet.");
        return;
      }
      downloadBlob(blob, `${problem.slug}-sketch${part === "selection" ? "-selection" : ""}.png`);
    } catch (err) {
      console.error(err);
      toast.error("Couldn't make the picture. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            disabled={busy || s.live.length === 0}
            title="Save the sketch as a picture"
            aria-label="Export PNG"
          />
        }
      >
        {busy ? <Loader2Icon className="animate-spin" /> : <ImageDownIcon />}
        <span className="hidden lg:inline">Export PNG</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => void exportPng("all")}>Whole sketch</DropdownMenuItem>
        <DropdownMenuItem disabled={!hasSelection} onClick={() => void exportPng("selection")}>
          Selection only
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem checked={background} onCheckedChange={setBackground}>
          Graph paper background
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Reads the sketch with the vision model and takes what it found to the workspace's new-attempt draft: code
 * written on the canvas into Pseudo-code, an account of what the drawing shows into Idea / explanation. The
 * learner checks it and presses Process themselves.
 */
function DraftAttemptButton({ store, problem }: { store: SketchStore; problem: ProblemDetail }) {
  const router = useRouter();
  const s = useSketch(store);
  const [step, setStep] = useState<"capturing" | "reading" | null>(null);

  async function draft() {
    const { elements, live } = store.state;
    setStep("capturing");
    try {
      const picture = await captureForReading(store);
      if (!picture) {
        toast.error("Draw something first: there's nothing to read yet.");
        setStep(null);
        return;
      }
      setStep("reading");
      const body = new FormData();
      body.append("file", picture, "sketch.png");
      body.append("sketchText", sketchOutline(elements, live));
      const reading = await api<SketchReading>(`/api/problems/${problem.id}/sketch/read`, { method: "POST", body });
      leaveSketchReading(problem.id, reading);
      // Stays on "Reading…" until the workspace replaces this page.
      router.push(problemPath(problem));
    } catch (err) {
      setStep(null);
      const setup = err instanceof ApiClientError && ["no_vision_model", "no_provider", "no_key"].includes(err.code);
      const message = err instanceof Error ? err.message : "Couldn't read your sketch.";
      if (setup) toast.error(message, { action: { label: "Settings", onClick: () => router.push("/settings") } });
      else toast.error(message);
    }
  }

  const label = step === "capturing" ? "Capturing…" : step === "reading" ? "Reading…" : "Draft an attempt";
  return (
    <>
      <Button
        variant="soft"
        size="sm"
        onClick={() => void draft()}
        disabled={step !== null || s.live.length === 0}
        title="Read this sketch with your vision model and put it into a new attempt for you to check: code you wrote here goes into Pseudo-code, what the drawing shows into Idea / explanation"
        aria-label={label}
      >
        {step ? <Loader2Icon className="animate-spin" /> : <ScanTextIcon />}
        <span className="hidden sm:inline">{label}</span>
      </Button>
      <span className="sr-only" role="status">
        {step === "capturing" ? "Capturing the sketch" : step === "reading" ? "Reading the sketch" : ""}
      </span>
    </>
  );
}

export function SketchActions({ store, problem }: { store: SketchStore; problem: ProblemDetail }) {
  return (
    <>
      <ExportMenu store={store} problem={problem} />
      <DraftAttemptButton store={store} problem={problem} />
    </>
  );
}
