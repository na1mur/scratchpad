import { randomNonce } from "./elements";
import type { SketchElement } from "./types";

/**
 * Undo and redo. An entry holds, for each element one action changed, the element before and after it (before is
 * undefined for an element the action created). Undo writes `before` back and redo writes `after`, each as a new
 * version on top of whatever is there now, so they save and merge like any other edit. The entry itself moves
 * between the stacks unchanged. A drag is one entry, not one per pointer move: callers record when it ends.
 */

export type HistoryEntry = ReadonlyMap<string, { before: SketchElement | undefined; after: SketchElement }>;

const MAX_ENTRIES = 200;

export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];

  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }

  record(entry: HistoryEntry) {
    if (!entry.size) return;
    this.undoStack.push(entry);
    if (this.undoStack.length > MAX_ENTRIES) this.undoStack.shift();
    this.redoStack = [];
  }

  /** The elements to write to undo the last action, or null when there's nothing to undo. */
  undo(current: ReadonlyMap<string, SketchElement>): SketchElement[] | null {
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.redoStack.push(entry);
    return restore(entry, current, "before");
  }

  redo(current: ReadonlyMap<string, SketchElement>): SketchElement[] | null {
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.undoStack.push(entry);
    return restore(entry, current, "after");
  }
}

function restore(entry: HistoryEntry, current: ReadonlyMap<string, SketchElement>, side: "before" | "after"): SketchElement[] {
  return [...entry].map(([id, pair]) => {
    // An element the action created is deleted by undoing it.
    const content = pair[side] ?? { ...pair.after, isDeleted: true };
    const version = Math.max(current.get(id)?.version ?? 0, content.version) + 1;
    return { ...content, version, versionNonce: randomNonce(), updated: Date.now() } as SketchElement;
  });
}
