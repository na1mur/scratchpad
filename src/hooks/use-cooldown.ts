"use client";

import { useEffect, useState } from "react";

/** Counts down in whole seconds from `start()`; `left` is 0 when the action is available again. */
export function useCooldown(initialSeconds = 0) {
  const [left, setLeft] = useState(initialSeconds);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left]);
  return { left, start: (seconds: number) => setLeft(seconds) };
}
