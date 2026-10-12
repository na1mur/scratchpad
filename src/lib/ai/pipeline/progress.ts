import "server-only";
import type { ProgressCase, RunProgress } from "@/lib/runProgress";

/**
 * Collects a run's partial output and publishes a snapshot after every change. Publishes run one at a
 * time, in order, and never fail the run: progress is only for show.
 */
export class ProgressTracker {
  private state: RunProgress = {};
  private publishing = Promise.resolve();

  constructor(private publish: (p: RunProgress) => Promise<unknown> | void) {}

  update(change: (p: RunProgress) => void) {
    change(this.state);
    const snapshot = structuredClone(this.state);
    this.publishing = this.publishing.then(() => this.publish(snapshot)).then(
      () => {},
      () => {},
    );
  }

  updateCase(id: string, patch: Partial<ProgressCase>) {
    this.update((p) => {
      const c = p.cases?.find((x) => x.id === id);
      if (c) Object.assign(c, patch);
    });
  }

  /** Waits for pending publishes, so a final write can't be overtaken by a stale snapshot. */
  flush() {
    return this.publishing;
  }
}
