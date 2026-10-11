import type { ShareKind } from "@/models/Share";

/** The public page for a share. Attempts are shown as "pseudo-code", which is what the learner wrote. */
export const sharedPath = (kind: ShareKind, token: string) =>
  `/shared/${kind === "attempt" ? "pseudo-code" : "solution"}/${token}`;

/**
 * Holds a share token while a signed-out visitor who pressed "Fork" logs in, signs up or onboards, none of
 * which keep `next` all the way through. `PendingFork` finishes the fork once they're in the app.
 */
export const PENDING_FORK_COOKIE = "pending_fork";
