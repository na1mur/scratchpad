"use client";

import { useEffect, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent } from "react";
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

const NUMS = [3, 8, 2, 7, 5];
const TARGET = 9;

const CODE = [
  "function pairWithSum(nums, target):",
  "  lo = 0",
  "  hi = len(nums) - 1",
  "  while lo < hi:",
  "    sum = nums[lo] + nums[hi]",
  "    if sum == target: return [lo, hi]",
  "    if sum < target: lo = lo + 1",
  "    else: hi = hi - 1",
  "  return none",
];

type Step = {
  line: number;
  lo: number;
  hi: number;
  dropped: number[];
  sum: number | null;
  title: string;
  text: string;
  bug?: boolean;
  note?: string;
};

const STEPS: Step[] = [
  {
    line: 2,
    lo: 0,
    hi: 4,
    dropped: [],
    sum: null,
    title: "Start at both ends",
    text: "lo points at 3 and hi points at 5. The loop runs while lo is left of hi.",
  },
  {
    line: 4,
    lo: 0,
    hi: 4,
    dropped: [],
    sum: 8,
    title: "Add the two ends",
    text: "3 + 5 = 8, which isn't the target, 9.",
  },
  {
    line: 6,
    lo: 1,
    hi: 4,
    dropped: [0],
    sum: 8,
    title: "Sum is too small",
    text: "8 < 9, so lo moves right and 3 is dropped.",
  },
  {
    line: 4,
    lo: 1,
    hi: 4,
    dropped: [0],
    sum: 13,
    title: "Add the two ends",
    text: "8 + 5 = 13. Still not 9.",
  },
  {
    line: 7,
    lo: 1,
    hi: 3,
    dropped: [0, 4],
    sum: 13,
    title: "Sum is too big",
    text: "13 > 9, so hi moves left and 5 is dropped.",
  },
  {
    line: 4,
    lo: 1,
    hi: 3,
    dropped: [0, 4],
    sum: 15,
    title: "Add the two ends",
    text: "8 + 7 = 15. Too big again.",
  },
  {
    line: 7,
    lo: 1,
    hi: 2,
    dropped: [0, 4, 3],
    sum: 15,
    title: "Sum is too big",
    text: "15 > 9, so hi moves left and 7 is dropped.",
    bug: true,
    note: "2 + 7 = 9, and this step just dropped the 7.",
  },
  {
    line: 8,
    lo: 1,
    hi: 1,
    dropped: [0, 4, 3, 2],
    sum: 10,
    title: "Pointers meet",
    text: "One more pass drops 2 and the loop ends. It returns none, yet the values at indexes 2 and 3 add up to 9.",
    bug: true,
    note: "2 + 7 = 9, and this step just dropped the 7.",
  },
];

const BUG_STEP = STEPS.findIndex((s) => s.bug);
const LAST = STEPS.length - 1;

const CELL = 44;
const GAP = 6;
const PITCH = CELL + GAP;

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

function Pointer({ name, index, side }: { name: string; index: number; side: "above" | "below" }) {
  const triangle = (
    <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden className={side === "below" ? "rotate-180" : undefined}>
      <path d="M0 0h10L5 6z" fill="currentColor" />
    </svg>
  );
  return (
    <div className="relative h-6" aria-hidden>
      <div
        className="absolute top-0 left-0 flex flex-col items-center text-pen-blue transition-transform duration-500 ease-out motion-reduce:transition-none"
        style={{ width: CELL, transform: `translateX(${index * PITCH}px)` }}
      >
        {side === "above" ? (
          <>
            <span className="font-mono text-xs leading-4 font-medium">{name}</span>
            {triangle}
          </>
        ) : (
          <>
            {triangle}
            <span className="font-mono text-xs leading-4 font-medium">{name}</span>
          </>
        )}
      </div>
    </div>
  );
}

export function TraceSpecimen() {
  const reducedMotion = usePrefersReducedMotion();
  const [stepIndex, setStepIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const step = STEPS[stepIndex];

  // Plays once from the start to the bug, then rests there.
  const autoplaying = !reducedMotion && !manual && stepIndex < BUG_STEP;
  useEffect(() => {
    if (!autoplaying) return;
    const timer = setTimeout(() => setStepIndex((i) => i + 1), stepIndex === 0 ? 1400 : 1500);
    return () => clearTimeout(timer);
  }, [autoplaying, stepIndex]);

  function go(next: number) {
    setManual(true);
    setStepIndex(Math.min(LAST, Math.max(0, next)));
  }

  function replay() {
    setManual(false);
    setStepIndex(0);
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      go(stepIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      go(stepIndex - 1);
    }
  }

  return (
    <div
      role="group"
      aria-label="A two-pointer approach traced step by step. Use the left and right arrow keys to step."
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="rounded-sm border border-ink/20 bg-sheet outline-none focus-visible:ring-2 focus-visible:ring-pen-blue/60"
    >
      <div className="grid md:grid-cols-[auto_1fr]">
        {/* Pseudo-code: the red rule is the notebook margin and the gutter divider. */}
        <div className="overflow-x-auto border-b border-ink/10 py-5 md:border-r md:border-b-0">
          <div className="relative min-w-max px-0 font-mono text-[12.5px] leading-7">
            <div
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-7 transition-[transform,background-color] duration-300 ease-out motion-reduce:transition-none",
                step.bug ? "bg-pen-red/25" : "bg-marker/80 dark:bg-marker/30",
              )}
              style={{ transform: `translateY(${step.line * 28}px)` }}
            />
            <ol className="relative">
              {CODE.map((line, i) => (
                <li key={i} className="flex h-7">
                  <span
                    className={cn(
                      "w-9 shrink-0 border-r border-pen-red/60 pr-2.5 text-right select-none",
                      i === step.line && step.bug ? "text-pen-red" : "text-ink/45",
                    )}
                  >
                    {i + 1}
                  </span>
                  <code className="pr-6 pl-3 whitespace-pre text-ink">{line}</code>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* Trace */}
        <div className="flex min-w-0 flex-col gap-3 p-5">
          <p className="font-mono text-sm text-ink/60">
            nums = [{NUMS.join(", ")}] <span className="px-1.5">target = {TARGET}</span>
          </p>

          <div style={{ "--cell": `${CELL}px`, "--gap": `${GAP}px` } as CSSProperties} className="w-fit max-w-full overflow-x-auto pb-1">
            <div className="relative w-fit pt-1">
              <Pointer name="lo" index={step.lo} side="above" />
              <ul className="relative flex" style={{ gap: GAP }}>
                {NUMS.map((value, i) => {
                  const dropped = step.dropped.includes(i);
                  const inPlay = i === step.lo || i === step.hi;
                  return (
                    <li
                      key={i}
                      className={cn(
                        "relative grid place-items-center rounded-md border-[1.5px] font-mono text-base font-medium transition-[opacity,background-color,border-color] duration-300 motion-reduce:transition-none",
                        inPlay && !dropped ? "border-pen-blue bg-pen-blue/10" : "border-ink/70 bg-sheet",
                        dropped && "opacity-45",
                      )}
                      style={{ width: CELL, height: CELL }}
                    >
                      {value}
                      {dropped && (
                        <svg viewBox="0 0 44 44" fill="none" aria-hidden className="absolute inset-0 text-ink/70">
                          <path
                            d="M7 38C16 29 27 17 38 6"
                            pathLength="1"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            className="pen-draw"
                          />
                        </svg>
                      )}
                    </li>
                  );
                })}
                {step.bug && (
                  <svg
                    key="bug-loop"
                    viewBox="0 0 106 56"
                    fill="none"
                    aria-hidden
                    className="pointer-events-none absolute text-pen-red"
                    style={{ left: 2 * PITCH - 6, top: -6, width: 2 * CELL + GAP + 12, height: CELL + 12 }}
                  >
                    <path
                      d="M12 30C8 10 40 4 56 5C90 6 102 18 98 32C94 48 60 52 36 50C18 48 6 42 9 24"
                      pathLength="1"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="pen-draw"
                      style={{ "--pen-delay": "0.15s", animationDuration: "0.7s" } as CSSProperties}
                    />
                  </svg>
                )}
              </ul>
              <ul className="flex pt-1" style={{ gap: GAP }} aria-hidden>
                {NUMS.map((_, i) => (
                  <li key={i} className="text-center font-mono text-xs text-ink/55" style={{ width: CELL }}>
                    {i}
                  </li>
                ))}
              </ul>
              <Pointer name="hi" index={step.hi} side="below" />
            </div>
          </div>

          <dl className="flex gap-5 font-mono text-sm">
            <div>
              <dt className="inline text-ink/55">lo </dt>
              <dd className="inline font-medium">{step.lo}</dd>
            </div>
            <div>
              <dt className="inline text-ink/55">hi </dt>
              <dd className="inline font-medium">{step.hi}</dd>
            </div>
            <div>
              <dt className="inline text-ink/55">sum </dt>
              <dd className="inline font-medium">{step.sum ?? "-"}</dd>
            </div>
          </dl>

          <div
            className="min-h-[5.5rem] text-sm leading-6"
            aria-live={manual ? "polite" : "off"}
          >
            <p className="font-medium">{step.title}</p>
            <p className="text-ink/70">{step.text}</p>
          </div>

          <div className="min-h-[4.25rem]">
            {step.note && (
              <p
                key="note"
                className="flex max-w-[19rem] -rotate-1 items-start gap-2 font-hand text-2xl leading-6 font-semibold text-pen-red animate-in duration-500 fade-in fill-mode-backwards motion-reduce:animate-none"
                style={{ animationDelay: stepIndex === BUG_STEP ? "0.8s" : "0s" }}
              >
                <svg width="30" height="26" viewBox="0 0 30 26" fill="none" aria-hidden className="mt-0.5 shrink-0">
                  <path d="M27 22C17 21 8 14 5 4M1 10l4-7 6 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {step.note}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-ink/10 px-3 py-2">
        <div className="flex">
          <Button variant="ghost" size="icon-sm" aria-label="Previous step" disabled={stepIndex === 0} onClick={() => go(stepIndex - 1)}>
            <ChevronLeftIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Next step" disabled={stepIndex === LAST} onClick={() => go(stepIndex + 1)}>
            <ChevronRightIcon />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Replay from the start" onClick={replay}>
            <RotateCcwIcon />
          </Button>
        </div>
        <ol className="flex min-w-0 flex-1 gap-1">
          {STEPS.map((s, i) => (
            <li key={i} className="flex-1">
              <button
                type="button"
                aria-label={`Step ${i + 1}: ${s.title}`}
                aria-current={i === stepIndex ? "step" : undefined}
                onClick={() => go(i)}
                className="group flex h-6 w-full items-center outline-none"
              >
                <span
                  className={cn(
                    "h-1.5 w-full rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-pen-blue",
                    s.bug === true && i === BUG_STEP
                      ? i <= stepIndex
                        ? "bg-pen-red"
                        : "bg-pen-red/35"
                      : i <= stepIndex
                        ? "bg-ink"
                        : "bg-ink/15",
                  )}
                />
              </button>
            </li>
          ))}
        </ol>
        <p className="w-14 shrink-0 text-right font-mono text-xs text-ink/55">
          {stepIndex + 1} of {STEPS.length}
        </p>
      </div>
    </div>
  );
}
