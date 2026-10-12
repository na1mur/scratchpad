import "server-only";

type Run = { controller: AbortController; ended: Promise<void>; end: () => void };

// Live runs in this process, keyed by attempt or solution id, so a cancel
// request can abort the model call in flight. Kept on globalThis like the
// event bus so dev reloads share it.
const g = globalThis as unknown as { __pipelineRuns?: Map<string, Run> };
const runs = (g.__pipelineRuns ??= new Map());

/** Registers a run and returns the signal its model calls should honour. Pair with `endRun()`. */
export function startRun(id: string): AbortSignal {
  const controller = new AbortController();
  let end = () => {};
  const ended = new Promise<void>((resolve) => (end = resolve));
  runs.set(id, { controller, ended, end });
  return controller.signal;
}

export function endRun(id: string) {
  runs.get(id)?.end();
  runs.delete(id);
}

/**
 * Aborts a run in this process and waits (briefly) for its runner to clean
 * up. False when there's no run here (it died, or it's in another process),
 * in which case the caller cleans up the stored run itself. A run already
 * past its last model call may still finish, so callers re-read it after.
 */
export async function cancelRun(id: string, waitMs = 10_000): Promise<boolean> {
  const run = runs.get(id);
  if (!run) return false;
  run.controller.abort();
  await Promise.race([run.ended, new Promise((resolve) => setTimeout(resolve, waitMs))]);
  return true;
}
