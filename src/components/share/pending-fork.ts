"use client";

import { PENDING_FORK_COOKIE } from "@/lib/sharePaths";

// A day is plenty to log in, sign up and onboard; after that the visitor has likely moved on.
const MAX_AGE_S = 24 * 60 * 60;

export function rememberPendingFork(token: string) {
  document.cookie = `${PENDING_FORK_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE_S}; samesite=lax`;
}

/** Reads and clears the pending fork in one go, so it's only ever attempted once. */
export function takePendingFork(): string | null {
  const match = document.cookie.split("; ").find((c) => c.startsWith(`${PENDING_FORK_COOKIE}=`));
  if (!match) return null;
  document.cookie = `${PENDING_FORK_COOKIE}=; path=/; max-age=0; samesite=lax`;
  return decodeURIComponent(match.slice(PENDING_FORK_COOKIE.length + 1)) || null;
}
