"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ChevronLeftIcon, ChevronRightIcon, MaximizeIcon, MinimizeIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { LessonSpec, Slide } from "@/lib/ai/schemas/lesson";
import { SlideView, type SlideState } from "./slides";

const FRAME_MS = 2600;

type Position = { slide: number } & Omit<SlideState, "playing">;

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox";
}

/** How a slide looks when you arrive at it going forward (its start) or back (its end). */
function arrive(slides: Slide[], slide: number, from: "start" | "end"): Position {
  const s = slides[slide];
  if (from === "start") return { slide, frame: 0, revealed: false };
  return { slide, frame: s.kind === "walk" ? s.frames.length - 1 : 0, revealed: s.kind === "predict" };
}

/**
 * Presents a lesson. Next and back step through a walk's moments and a prediction's answer before moving
 * to another slide, like builds in a presentation; ←/→, Space and PageUp/PageDown do the same, F goes full
 * screen.
 */
export function SlideDeck({ spec, problemHref }: { spec: LessonSpec; problemHref: string }) {
  const { slides } = spec;
  const last = slides.length - 1;
  const [pos, setPos] = useState<Position>({ slide: 0, frame: 0, revealed: false });
  const [playing, setPlaying] = useState(false);
  const [direction, setDirection] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const slide = slides[pos.slide];

  const go = (next: Position) => {
    if (next.slide !== pos.slide) {
      setDirection(next.slide > pos.slide ? 1 : -1);
      setPlaying(false);
    }
    setPos(next);
  };

  const advance = () => {
    if (slide.kind === "walk" && pos.frame < slide.frames.length - 1) return go({ ...pos, frame: pos.frame + 1 });
    if (slide.kind === "predict" && !pos.revealed) return go({ ...pos, revealed: true });
    if (pos.slide < last) go(arrive(slides, pos.slide + 1, "start"));
  };
  const back = () => {
    if (slide.kind === "walk" && pos.frame > 0) return go({ ...pos, frame: pos.frame - 1 });
    if (slide.kind === "predict" && pos.revealed) return go({ ...pos, revealed: false });
    if (pos.slide > 0) go(arrive(slides, pos.slide - 1, "end"));
  };
  const atEnd = pos.slide === last && !(slide.kind === "walk" && pos.frame < slide.frames.length - 1) && !(slide.kind === "predict" && !pos.revealed);
  const atStart = pos.slide === 0 && pos.frame === 0 && !pos.revealed;

  // A playing walk moves on by itself and stops at its last moment.
  const walkLength = slide.kind === "walk" ? slide.frames.length : 0;
  const isPlaying = playing && pos.frame < walkLength - 1;
  useEffect(() => {
    if (!isPlaying) return;
    const t = setTimeout(() => setPos((p) => ({ ...p, frame: p.frame + 1 })), FRAME_MS);
    return () => clearTimeout(t);
  }, [isPlaying, pos.frame]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
      const onButton = e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement;
      if (e.key === "ArrowRight" || e.key === "PageDown" || (e.key === " " && !onButton)) {
        e.preventDefault();
        setPlaying(false);
        advance();
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        setPlaying(false);
        back();
      } else if (e.key === "Home") {
        e.preventDefault();
        go(arrive(slides, 0, "start"));
      } else if (e.key === "End") {
        e.preventDefault();
        go(arrive(slides, last, "start"));
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        void toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === root.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.requestFullscreen();
    } catch {
      // Not allowed here (an iframe, an old browser): the deck still works in the page.
    }
  }

  return (
    <MotionConfig reducedMotion="user">
      <div
        ref={root}
        className={cn("flex flex-1 flex-col gap-3", fullscreen && "bg-background bg-graph-subtle p-6")}
        aria-roledescription="slide deck"
      >
        <section
          aria-roledescription="slide"
          aria-label={`Slide ${pos.slide + 1} of ${slides.length}: ${slide.title}`}
          className="relative flex min-h-[32rem] flex-1 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm"
        >
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={pos.slide}
              custom={direction}
              initial={{ opacity: 0, x: 24 * direction }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 * direction }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="flex flex-1 flex-col justify-center p-5 sm:p-8 lg:p-12"
            >
              <SlideView
                slide={slide}
                index={pos.slide}
                cases={spec.cases}
                state={{ ...pos, playing: isPlaying }}
                problemHref={problemHref}
                controls={{
                  setFrame: (frame) => {
                    setPlaying(false);
                    setPos((p) => ({ ...p, frame }));
                  },
                  reveal: () => setPos((p) => ({ ...p, revealed: true })),
                  togglePlay: () => {
                    if (!isPlaying && pos.frame >= walkLength - 1) setPos((p) => ({ ...p, frame: 0 }));
                    setPlaying(!isPlaying);
                  },
                  next: advance,
                }}
              />
            </motion.div>
          </AnimatePresence>
        </section>

        <nav className="flex items-center gap-2" aria-label="Slides">
          <Button variant="outline" onClick={back} disabled={atStart} aria-label="Back (←)">
            <ChevronLeftIcon /> <span className="max-sm:sr-only">Back</span>
          </Button>
          <ol className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1.5">
            {slides.map((s, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => go(arrive(slides, i, "start"))}
                  aria-label={`Slide ${i + 1}: ${s.title}`}
                  aria-current={i === pos.slide ? "step" : undefined}
                  title={s.title}
                  className={cn(
                    "block h-2 rounded-full transition-all",
                    i === pos.slide ? "w-6 bg-brand-strong" : i < pos.slide ? "w-2 bg-brand" : "w-2 bg-muted-foreground/25 hover:bg-muted-foreground/50",
                  )}
                />
              </li>
            ))}
          </ol>
          <span className="text-xs text-muted-foreground tabular-nums max-sm:hidden">
            {pos.slide + 1} / {slides.length}
          </span>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button variant="ghost" size="icon" onClick={() => void toggleFullscreen()} aria-label={fullscreen ? "Exit full screen (F)" : "Full screen (F)"} />
              }
            >
              {fullscreen ? <MinimizeIcon /> : <MaximizeIcon />}
            </TooltipTrigger>
            <TooltipContent>{fullscreen ? "Exit full screen (F)" : "Full screen (F)"}</TooltipContent>
          </Tooltip>
          <Button variant="brand" onClick={advance} disabled={atEnd} aria-label="Next (→)">
            <span className="max-sm:sr-only">Next</span> <ChevronRightIcon />
          </Button>
        </nav>
      </div>
    </MotionConfig>
  );
}
