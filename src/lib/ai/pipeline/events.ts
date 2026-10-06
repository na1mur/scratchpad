import "server-only";
import { EventEmitter } from "node:events";
import type { AttemptStatus } from "@/models/Attempt";

export type PipelineEvent =
  | { type: "status"; status: AttemptStatus; detail?: string }
  | { type: "done"; attemptId: string }
  | { type: "error"; code: string; message: string };

// One process-wide bus. A refreshed page doesn't reattach to it; it polls
// the attempt's stored status instead.
const g = globalThis as unknown as { __pipelineBus?: EventEmitter };
const bus = (g.__pipelineBus ??= new EventEmitter().setMaxListeners(100));

export function emit(attemptId: string, event: PipelineEvent) {
  bus.emit(attemptId, event);
}

export function subscribe(attemptId: string, listener: (e: PipelineEvent) => void): () => void {
  bus.on(attemptId, listener);
  return () => bus.off(attemptId, listener);
}
