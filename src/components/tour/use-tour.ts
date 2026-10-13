"use client";

import { useEffect, useRef } from "react";
import type { Driver } from "driver.js";
import { api } from "@/lib/fetcher";
import { TOUR_STEPS, type TourId } from "@/lib/tours";

/** Lets the panes finish laying out (and a just-finished run settle) before anything is highlighted. */
const START_DELAY_MS = 800;

// Tours shown (or covered by another tour's step) since the page loaded: the `seen` prop only catches up
// on the next server render. And one tour at a time.
const shownThisSession = new Set<TourId>();
let running: TourId | null = null;

/**
 * Runs the first-run tour `id` once `ready` is true, unless the learner has already seen it. It's marked
 * as seen when it starts rather than when it ends, so closing it early or reloading doesn't bring it back.
 */
export function useTour(id: TourId, { seen, ready }: { seen: readonly TourId[]; ready: boolean }) {
  const alreadySeen = seen.includes(id);
  const started = useRef(false);
  const active = useRef<Driver | null>(null);

  useEffect(() => {
    if (!ready || alreadySeen || started.current) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (shownThisSession.has(id) || running) return;
      // Only what's on the page now: not every learner has a notebook upload or something to fix.
      const steps = TOUR_STEPS[id]
        .map((s) => ({ ...s, element: `[data-tour="${s.target}"]` }))
        .filter((s) => document.querySelector(s.element));
      if (steps.length === 0) return;
      const { driver } = await import("driver.js");
      if (cancelled || running) return;
      started.current = true;
      running = id;
      // This tour, and any tour one of its steps stands in for. A failed save only means a tour shows once more.
      for (const tour of new Set([id, ...steps.flatMap((s) => (s.covers ? [s.covers] : []))])) {
        shownThisSession.add(tour);
        api("/api/settings/tours", { method: "POST", body: { tour } }).catch(() => {});
      }
      active.current = driver({
        popoverClass: "scratchpad-tour",
        showProgress: true,
        progressText: "{{current}} of {{total}}",
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Got it",
        stagePadding: 6,
        stageRadius: 8,
        overlayOpacity: 0.55,
        smoothScroll: true,
        onDestroyed: () => {
          if (running === id) running = null;
        },
        steps: steps.map((s) => ({
          element: s.element,
          popover: { title: s.title, description: s.description, side: s.side },
        })),
      });
      active.current.drive();
    }, START_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, ready, alreadySeen]);

  // Only leaving the page ends a tour that's running: a refresh that brings in the saved "seen" must not.
  useEffect(
    () => () => {
      active.current?.destroy();
      active.current = null;
    },
    [],
  );
}
