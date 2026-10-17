"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CheckIcon, PlayIcon, XIcon } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

const FILE = "pair_with_sum.py";

const CODE = [
  "def pair_with_sum(nums, target):",
  "    lo, hi = 0, len(nums) - 1",
  "    while lo < hi:",
  "        s = nums[lo] + nums[hi]",
  "        if s == target:",
  "            return [lo, hi]",
  "        if s < target:",
  "            lo += 1",
  "        else:",
  "            hi -= 1",
  "    return None",
];

type Case = { input: string; expected: string; got: string; pass: boolean };

// The same buggy two-pointer approach as the trace above: it drops the 7 too early.
const CASES: Case[] = [
  { input: "[2, 7, 11, 15], 9", expected: "[0, 1]", got: "[0, 1]", pass: true },
  { input: "[1, 4, 6, 8], 10", expected: "[1, 2]", got: "[1, 2]", pass: true },
  { input: "[3, 8, 2, 7, 5], 9", expected: "[2, 3]", got: "None", pass: false },
  { input: "[4, 4], 8", expected: "[0, 1]", got: "[0, 1]", pass: true },
  { input: "[5], 5", expected: "None", got: "None", pass: true },
];
const FIRST_FAIL = CASES.findIndex((c) => !c.pass);
const PASSED = CASES.filter((c) => c.pass).length;

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

function StatusIcon({ state }: { state: "waiting" | "running" | "pass" | "fail" }) {
  const base = "grid size-5 shrink-0 place-items-center rounded-full";
  if (state === "pass")
    return (
      <span aria-hidden className={cn(base, "bg-brand text-brand-foreground")}>
        <CheckIcon className="size-3.5" strokeWidth={3} />
      </span>
    );
  if (state === "fail")
    return (
      <span aria-hidden className={cn(base, "bg-pen-red text-paper")}>
        <XIcon className="size-3.5" strokeWidth={3} />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(base, "border-[1.5px]", state === "running" ? "animate-pulse border-pen-blue" : "border-ink/25")}
    />
  );
}

/** Test cases for one function, run once as the section scrolls into view, and again on request. */
export function TestRunSpecimen() {
  const reducedMotion = usePrefersReducedMotion();
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [root, setRoot] = useState<HTMLDivElement | null>(null);

  // Start the first run once the panel is on screen, so it isn't over before anyone scrolls to it.
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
    if (!started || reducedMotion || done >= CASES.length) return;
    const timer = setTimeout(() => setDone((n) => n + 1), done === 0 ? 700 : 520);
    return () => clearTimeout(timer);
  }, [started, reducedMotion, done]);

  const shown = reducedMotion ? CASES.length : done;
  const finished = shown === CASES.length;
  const detailIndex = picked ?? (finished ? FIRST_FAIL : null);
  const detail = detailIndex === null ? null : CASES[detailIndex];

  function runAgain() {
    setPicked(null);
    setDone(0);
    setStarted(true);
  }

  return (
    <div
      ref={setRoot}
      role="group"
      aria-label="A Python function run against five fixed test cases, one of which fails."
      className="rounded-sm border border-ink/20 bg-sheet"
    >
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2 text-sm">
        <span className="font-mono text-xs text-ink/70">{FILE}</span>
        <span className="text-ink/70">Playground</span>
      </div>

      <div className="grid md:grid-cols-[auto_1fr]">
        {/* Code, in the same notebook-margin style as the trace. */}
        <div className="overflow-x-auto border-b border-ink/10 py-4 md:border-r md:border-b-0">
          <ol className="min-w-max font-mono text-[12.5px] leading-6">
            {CODE.map((line, i) => (
              <li key={i} className="flex">
                <span className="w-9 shrink-0 border-r border-pen-red/60 pr-2.5 text-right text-ink/65 select-none">
                  {i + 1}
                </span>
                <code className="pr-6 pl-3 whitespace-pre text-ink">{line}</code>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-w-0 flex-col">
          <ul className="flex flex-col p-2">
            {CASES.map((c, i) => {
              const state = i < shown ? (c.pass ? "pass" : "fail") : i === shown && started ? "running" : "waiting";
              const label = { pass: "Passed", fail: "Failed", running: "Running", waiting: "Waiting" }[state];
              return (
                <li key={i}>
                  <button
                    type="button"
                    disabled={i >= shown}
                    aria-pressed={detailIndex === i}
                    onClick={() => setPicked(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-pen-blue/60",
                      detailIndex === i ? "bg-ink/[0.06]" : "enabled:hover:bg-ink/[0.04]",
                    )}
                  >
                    <StatusIcon state={state} />
                    <span className="min-w-0 flex-1 truncate font-mono text-[12.5px]">{c.input}</span>
                    <span
                      className={cn(
                        "shrink-0 text-sm",
                        state === "fail" ? "font-medium text-pen-red" : "text-ink/70",
                      )}
                    >
                      {label}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-h-[7.5rem] border-t border-ink/10 px-4 py-3 text-sm leading-6">
            {detail ? (
              <div key={detailIndex} className="animate-in duration-300 fade-in motion-reduce:animate-none">
                <p className="font-mono text-[12.5px]">
                  expected <span className="font-medium">{detail.expected}</span>, got{" "}
                  <span className={cn("font-medium", !detail.pass && "text-pen-red")}>{detail.got}</span>
                </p>
                <p className="mt-1 text-ink/70">
                  {detail.pass
                    ? "Matches the checked answer."
                    : "2 + 7 = 9, but the loop drops the 7 first. Show steps plays this case frame by frame."}
                </p>
              </div>
            ) : (
              <p className="text-ink/70">Select a finished case to compare the answers.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink/10 px-4 py-2">
        <p className="text-sm text-ink/70" aria-live="polite">
          {finished ? (
            <>
              <span className="font-medium text-ink">
                {PASSED} of {CASES.length} passed.
              </span>{" "}
              Ran in your browser. No tokens spent.
            </>
          ) : (
            "Runs in your browser. No tokens spent."
          )}
        </p>
        {!reducedMotion && (
          <Button variant="outline" size="sm" disabled={!finished} onClick={runAgain}>
            <PlayIcon />
            Run again
          </Button>
        )}
      </div>
    </div>
  );
}
