import "server-only";
import { EventEmitter } from "node:events";
import type { AttemptStatus } from "@/models/Attempt";
import type { SolutionStatus } from "@/models/Solution";

export type PipelineEvent =
  | { type: "status"; status: AttemptStatus; detail?: string }
  | { type: "done"; attemptId: string }
  // `discarded`: the failed run was removed instead of being kept as an attempt.
  | { type: "error"; code: string; message: string; discarded?: boolean };

/** A solution run's progress, streamed by GET /api/solutions/[id]/events. */
export type SolutionEvent =
  | { type: "status"; status: SolutionStatus }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// One process-wide bus, keyed by attempt or solution id. A refreshed attempt
// page doesn't reattach to it; it polls the attempt's stored status instead.
// A solution page subscribes through its events route on every load.
const g = globalThis as unknown as { __pipelineBus?: EventEmitter };
const bus = (g.__pipelineBus ??= new EventEmitter().setMaxListeners(100));

export function emit(id: string, event: PipelineEvent | SolutionEvent) {
  bus.emit(id, event);
}

/** `E` is the event type the id carries: PipelineEvent for attempts, SolutionEvent for solutions. */
export function subscribe<E extends PipelineEvent | SolutionEvent = PipelineEvent>(
  id: string,
  listener: (e: E) => void,
): () => void {
  bus.on(id, listener);
  return () => bus.off(id, listener);
}
