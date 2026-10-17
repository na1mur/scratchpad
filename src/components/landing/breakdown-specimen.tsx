"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

const NUMS = [1, 3, 4, 6, 8, 11];
const TARGET = 10;
const CELL = 40;
const GAP = 6;
const PITCH = CELL + GAP;
const FRAME_MS = 2600;

// The deck's outline, so the strip says what a breakdown covers; the walk is the slide being shown.
const SLIDES = ["The problem", "First thoughts", "Key idea", "Your turn", "The plan", "Watch it", "Predict", "Cost"];
const SHOWN = SLIDES.indexOf("Watch it");

type Frame = { lo: number; hi: number; crossed: number[]; found?: boolean; caption: string };

// Two markers closing in on a pair that sums to 10, told without a line of code.
const FRAMES: Frame[] = [
  { lo: 0, hi: 5, crossed: [], caption: "One marker on the smallest number, one on the largest." },
  { lo: 0, hi: 4, crossed: [5], caption: "1 + 11 = 12 is too big, and 11 is too big with any partner. Cross it out; hi moves left." },
  { lo: 1, hi: 4, crossed: [0, 5], caption: "1 + 8 = 9 is too small, and 1 is too small with anything left. Cross it out; lo moves right." },
  { lo: 1, hi: 3, crossed: [0, 4, 5], caption: "3 + 8 = 11, too big again. hi moves left." },
  { lo: 2, hi: 3, crossed: [0, 1, 4, 5], caption: "3 + 6 = 9, too small. lo moves right." },
  { lo: 2, hi: 3, crossed: [0, 1, 4, 5], found: true, caption: "4 + 6 = 10. Found in five checks, not the fifteen pairs a brute force tries." },
];
const LAST = FRAMES.length - 1;

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

function Marker({ name, index }: { name: string; index: number }) {
  return (
    <motion.div
      className="absolute top-0 left-0 flex flex-col items-center text-pen-blue"
      style={{ width: CELL }}
      initial={false}
      animate={{ x: index * PITCH }}
      transition={{ type: "spring", stiffness: 260, damping: 26 }}
    >
      <span className="font-hand text-xl leading-5 font-semibold">{name}</span>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
        <path d="M0 0h10L5 6z" fill="currentColor" />
      </svg>
    </motion.div>
  );
}

/** One slide of a breakdown, its walk playing once as the section scrolls into view and again on request. */
export function BreakdownSpecimen() {
  const reducedMotion = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const [frame, setFrame] = useState(0);
  const [manual, setManual] = useState(false);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  // Start playing once the slide is on screen, so it isn't over before anyone scrolls to it.
  useEffect(() => {
    if (!root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setStarted(true);
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    if (!started || manual || reducedMotion || frame >= LAST) return;
    const timer = setTimeout(() => setFrame((f) => f + 1), FRAME_MS);
    return () => clearTimeout(timer);
  }, [started, manual, reducedMotion, frame]);

  const step = (to: number) => {
    setManual(true);
    setFrame(Math.min(Math.max(to, 0), LAST));
  };
  const f = FRAMES[frame];

  return (
    <div
      ref={setRoot}
      role="group"
      aria-label="A slide from a breakdown: two markers move in from both ends of a sorted list until they find two numbers that add up to 10."
      className="overflow-hidden rounded-sm border border-ink/20 bg-sheet"
    >
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-2 text-sm">
        <span className="truncate text-ink/70">Breakdown · Two markers from both ends</span>
        <span className="shrink-0 font-mono text-xs text-ink/70">
          {SHOWN + 1} / {SLIDES.length}
        </span>
      </div>

      <ol className="flex flex-wrap gap-1.5 border-b border-ink/10 px-3 py-2.5 text-sm" aria-label="Slides">
        {SLIDES.map((name, i) => (
          <li
            key={name}
            aria-current={i === SHOWN ? "step" : undefined}
            className={cn(
              "rounded-sm border px-2 py-0.5",
              i === SHOWN ? "border-ink bg-ink text-paper" : "border-ink/15 bg-paper text-ink/75",
            )}
          >
            {name}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 bg-graph-subtle bg-paper px-5 py-6 sm:px-8 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:items-center">
        <div className="flex flex-col gap-3">
          <p className="text-xs font-semibold tracking-wider text-pen-blue uppercase">Watch it</p>
          <p className="text-display text-3xl">Markers closing in</p>
          <p
            key={frame}
            aria-live="polite"
            className="min-h-[4.5rem] animate-in text-base leading-6 text-ink/80 duration-300 fade-in motion-reduce:animate-none"
          >
            {f.caption}
          </p>
        </div>

        <div className="overflow-x-auto">
          <div className="w-fit" aria-hidden>
            <div className="relative h-9">
              <Marker name="lo" index={f.lo} />
              <Marker name="hi" index={f.hi} />
            </div>
            <ul className="flex" style={{ gap: GAP }}>
              {NUMS.map((value, i) => {
                const crossed = f.crossed.includes(i);
                const hit = f.found && (i === f.lo || i === f.hi);
                return (
                  <li
                    key={i}
                    className={cn(
                      "relative grid place-items-center rounded-md border-[1.5px] font-mono text-base font-medium transition-colors duration-500",
                      hit ? "border-ink bg-marker text-ink dark:text-paper" : "border-ink/70 bg-paper",
                      crossed && "opacity-45",
                    )}
                    style={{ width: CELL, height: CELL }}
                  >
                    {value}
                    {crossed && (
                      <svg viewBox="0 0 40 40" fill="none" className="absolute inset-0 text-ink/70">
                        <motion.path
                          d="M6 35C14 27 25 16 34 5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.45 }}
                        />
                      </svg>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 font-hand text-xl leading-6 font-semibold text-pen-blue">target = {TARGET}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/10 px-4 py-2">
        <ol className="flex items-center gap-1.5" aria-label="Moments">
          {FRAMES.map((_, i) => (
            <li key={i}>
              <button
                type="button"
                aria-label={`Moment ${i + 1}`}
                aria-current={i === frame ? "step" : undefined}
                onClick={() => step(i)}
                className={cn(
                  "block h-1.5 rounded-full outline-none transition-all focus-visible:ring-2 focus-visible:ring-pen-blue/60",
                  i === frame ? "w-5 bg-ink" : i < frame ? "w-2.5 bg-ink/50" : "w-2.5 bg-ink/20",
                )}
              />
            </li>
          ))}
        </ol>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous moment" disabled={frame === 0} onClick={() => step(frame - 1)}>
            <ChevronLeftIcon />
          </Button>
          {frame === LAST ? (
            <Button variant="outline" size="sm" onClick={() => (setManual(false), setFrame(0))}>
              <RotateCcwIcon /> Play again
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => step(frame + 1)}>
              Next <ChevronRightIcon />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
