"use client";

import { useSyncExternalStore } from "react";
import { ApiClientError, api } from "@/lib/fetcher";
import { followBindings } from "@/lib/sketch/bindings";
import { mergeElements } from "@/lib/sketch/elements";
import { History, type HistoryEntry } from "@/lib/sketch/history";
import type { Point, Rect, Shape } from "@/lib/sketch/layout";
import { sortByOrder } from "@/lib/sketch/order";
import { restoreElements } from "@/lib/sketch/restore";
import { DEFAULT_NEW_STYLE, type Style, type StylePatch } from "@/lib/sketch/style";
import type { SketchElement } from "@/lib/sketch/types";

/**
 * The sketch page's state, outside React so pointer moves don't go through component state. Components read it
 * with useSketch(). Every edit goes through commit(), which records one undo entry and marks the changed elements
 * unsaved; they're sent together on an interval or when the page is left, the server merges them and answers
 * with the whole sketch, which is merged back by version.
 */

export type Tool = "select" | "hand" | "pointer" | "link" | "freehand" | "note" | "text" | ShapeTool;

/** Tools that draw a free shape or line by dragging. */
export const SHAPE_TOOLS = ["rectangle", "rounded", "diamond", "ellipse", "arrow", "line"] as const;
export type ShapeTool = (typeof SHAPE_TOOLS)[number];

export function isShapeTool(tool: Tool): tool is ShapeTool {
  return (SHAPE_TOOLS as readonly string[]).includes(tool);
}

/** Screen position = (scene position + x/y) × zoom. */
export type Camera = { x: number; y: number; zoom: number };

/** The part of an element being typed into. */
export type EditTarget =
  | { kind: "cell"; elementId: string; index: number }
  | { kind: "matrixCell"; elementId: string; row: number; col: number }
  | { kind: "entry"; elementId: string; row: number; part: 0 | 1 }
  | { kind: "label"; elementId: string }
  | { kind: "value"; elementId: string }
  | { kind: "text"; elementId: string }
  | { kind: "name"; elementId: string };

/** What an unfinished gesture shows. */
export type Overlay =
  | { kind: "marquee"; rect: Rect }
  | { kind: "pointer"; from: Point; to: Point; snap: Shape | null }
  | { kind: "aim"; pointerId: string; to: Point; snap: Shape | null }
  | { kind: "link"; fromId: string; to: Point; snapId: string | null }
  | { kind: "freehand"; points: [number, number, number][] };

export type SaveStatus = "saved" | "pending" | "saving" | "error";

export type SketchSnapshot = {
  /** Every element, deletions included. */
  elements: ReadonlyMap<string, SketchElement>;
  /** Live elements in drawing order. */
  live: readonly SketchElement[];
  selection: ReadonlySet<string>;
  /** The cell that insert and remove act on, set by clicking a cell. */
  activeCell: { elementId: string; index: number } | null;
  editing: EditTarget | null;
  tool: Tool;
  camera: Camera;
  /** Elements being dragged, and by how much; committed when the drag ends. */
  drag: { ids: ReadonlySet<string>; dx: number; dy: number } | null;
  /**
   * Elements drawn in place of their stored copies (or in addition, when new) while a gesture is unfinished:
   * a shape being drawn or resized, a style being slid. Nothing is saved until the gesture commits.
   */
  preview: ReadonlyMap<string, SketchElement> | null;
  /** The style the shape and line tools draw with: the last one picked in the style panel. */
  newStyle: Style;
  overlay: Overlay | null;
  canUndo: boolean;
  canRedo: boolean;
  save: SaveStatus;
  saveError: string | null;
};

/** How long changes collect before they're sent while the learner keeps editing. */
export const SAVE_INTERVAL_MS = 30_000;
const RETRY_DELAY_MS = 5000;
/** Below the 64 KB browsers allow a keepalive request's body, with room for the headers. */
const KEEPALIVE_MAX_BYTES = 60_000;

export class SketchStore {
  private snapshot: SketchSnapshot;
  private listeners = new Set<() => void>();
  private history = new History();
  private dirty = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private saveAgain = false;
  /** What the ordinary save on its way carries, so leaving the page can send it again. */
  private inFlight: SketchElement[] = [];
  /** The highest order key ever used, deletions included, so new keys never collide. */
  private maxKey: string | null = null;
  /** The canvas size in CSS pixels. Nothing renders from it, so it isn't part of the snapshot. */
  viewport = { w: 0, h: 0 };

  constructor(
    private readonly problemId: string,
    initial: readonly SketchElement[],
  ) {
    const elements = new Map(restoreElements(initial).elements.map((el) => [el.id, el]));
    this.snapshot = {
      elements,
      live: [],
      selection: new Set(),
      activeCell: null,
      editing: null,
      tool: "select",
      camera: { x: 0, y: 0, zoom: 1 },
      drag: null,
      preview: null,
      newStyle: DEFAULT_NEW_STYLE,
      overlay: null,
      canUndo: false,
      canRedo: false,
      save: "saved",
      saveError: null,
    };
    this.snapshot = { ...this.snapshot, ...this.derive(elements) };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  get state() {
    return this.snapshot;
  }

  get lastKey() {
    return this.maxKey;
  }

  get firstKey() {
    return this.snapshot.live[0]?.index ?? null;
  }

  private set(partial: Partial<SketchSnapshot>) {
    this.snapshot = { ...this.snapshot, ...partial };
    for (const l of this.listeners) l();
  }

  private derive(elements: ReadonlyMap<string, SketchElement>) {
    let max: string | null = null;
    for (const el of elements.values()) if (max === null || el.index > max) max = el.index;
    this.maxKey = max;
    const live = sortByOrder([...elements.values()].filter((el) => !el.isDeleted));
    const liveIds = new Set(live.map((el) => el.id));
    const selection = this.snapshot ? new Set([...this.snapshot.selection].filter((id) => liveIds.has(id))) : new Set<string>();
    const activeCell = this.snapshot?.activeCell && liveIds.has(this.snapshot.activeCell.elementId) ? this.snapshot.activeCell : null;
    const editing = this.snapshot?.editing && liveIds.has(this.snapshot.editing.elementId) ? this.snapshot.editing : null;
    return { elements, live, selection, activeCell, editing };
  }

  /** Writes changed elements as one undoable action (or not, for undo itself and merges), and schedules a save. */
  commit(changes: readonly SketchElement[], opts: { record?: boolean; select?: Iterable<string> } = {}) {
    if (!changes.length) {
      if (opts.select) this.select(opts.select);
      return;
    }
    const prev = this.snapshot.elements;
    const elements = new Map(prev);
    const entry = new Map<string, { before: SketchElement | undefined; after: SketchElement }>();
    const write = (el: SketchElement) => {
      entry.set(el.id, { before: entry.get(el.id)?.before ?? prev.get(el.id), after: el });
      elements.set(el.id, el);
      this.dirty.add(el.id);
    };
    for (const el of changes) write(el);
    // Arrows attached to what changed are redrawn in the same undo entry.
    for (const el of followBindings(elements, new Set(changes.map((c) => c.id)))) write(el);
    if (opts.record !== false) this.history.record(entry as HistoryEntry);
    this.set({
      ...this.derive(elements),
      ...(opts.select && { selection: new Set(opts.select) }),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
    });
    this.scheduleSave();
  }

  undo() {
    const changes = this.history.undo(this.snapshot.elements);
    if (changes) this.commit(changes, { record: false });
    this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo, editing: null });
  }

  redo() {
    const changes = this.history.redo(this.snapshot.elements);
    if (changes) this.commit(changes, { record: false });
    this.set({ canUndo: this.history.canUndo, canRedo: this.history.canRedo, editing: null });
  }

  select(ids: Iterable<string>) {
    const selection = new Set(ids);
    const activeCell = this.snapshot.activeCell && selection.has(this.snapshot.activeCell.elementId) ? this.snapshot.activeCell : null;
    this.set({ selection, activeCell });
  }

  setActiveCell(activeCell: SketchSnapshot["activeCell"]) {
    this.set({ activeCell });
  }

  setTool(tool: Tool) {
    this.set({ tool, overlay: null, ...(tool !== "select" && { editing: null }) });
  }

  setCamera(camera: Camera) {
    this.set({ camera });
  }

  setEditing(editing: EditTarget | null) {
    this.set({ editing });
  }

  setDrag(drag: SketchSnapshot["drag"]) {
    this.set({ drag });
  }

  setOverlay(overlay: Overlay | null) {
    this.set({ overlay });
  }

  setPreview(elements: Iterable<SketchElement> | null) {
    this.set({ preview: elements ? new Map([...elements].map((el) => [el.id, el])) : null });
  }

  setNewStyle(patch: StylePatch) {
    this.set({ newStyle: { ...this.snapshot.newStyle, ...patch } });
  }

  // Saving: changes collect locally and go out together, at most once per SAVE_INTERVAL_MS while editing, and
  // at once when the learner saves (Ctrl+S), switches tabs or leaves the page (flushOnLeave).

  private scheduleSave() {
    if (this.snapshot.save !== "saving") this.set({ save: "pending", saveError: null });
    // The first change starts the clock; later ones ride along instead of pushing it back.
    this.saveTimer ??= setTimeout(() => void this.flush(), SAVE_INTERVAL_MS);
  }

  private clearTimer() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
  }

  private unsaved(ids: Iterable<string>): SketchElement[] {
    return [...new Set(ids)].flatMap((id) => {
      const el = this.snapshot.elements.get(id);
      return el ? [el] : [];
    });
  }

  /** Sends the changed elements now. */
  async flush() {
    this.clearTimer();
    if (this.saving) {
      this.saveAgain = true;
      return;
    }
    if (!this.dirty.size) return;
    const sent = this.unsaved(this.dirty);
    this.dirty.clear();
    this.saving = true;
    this.inFlight = sent;
    this.set({ save: "saving" });
    try {
      await this.send(sent, false);
    } finally {
      this.saving = false;
      this.inFlight = [];
      if (this.saveAgain) {
        this.saveAgain = false;
        void this.flush();
      }
    }
  }

  private async send(sent: SketchElement[], keepalive: boolean) {
    try {
      const res = await api<{ elements: unknown[] }>(`/api/problems/${this.problemId}/sketch`, {
        method: "PUT",
        body: { elements: sent },
        keepalive,
      });
      this.adopt(res.elements);
      this.set({ save: this.dirty.size ? "pending" : keepalive && this.saving ? "saving" : "saved", saveError: null });
    } catch (err) {
      // Whatever didn't change since is still unsaved.
      for (const el of sent) if (this.snapshot.elements.get(el.id)?.version === el.version) this.dirty.add(el.id);
      const permanent = err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 409;
      this.set({ save: "error", saveError: err instanceof Error ? err.message : "Couldn't save." });
      if (!permanent) {
        this.clearTimer();
        this.saveTimer = setTimeout(() => void this.flush(), RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Saves before the page goes away (a tab switch, closing, reloading, navigating): everything not yet confirmed
   * in one `keepalive` request, which the browser finishes after the page is gone. A save already on its way is
   * sent again, since an ordinary request can be cut off by the unload; the server keeps the newer copy of each
   * element, so a repeat is harmless. Returns false when the changes are too large for a keepalive request
   * (browsers cap its body at 64 KB): an ordinary save is started instead, and the page should ask before closing.
   */
  flushOnLeave(): boolean {
    const sent = this.unsaved([...this.dirty, ...this.inFlight.map((el) => el.id)]);
    if (!sent.length) return true;
    if (new TextEncoder().encode(JSON.stringify({ elements: sent })).length > KEEPALIVE_MAX_BYTES) {
      void this.flush();
      return false;
    }
    this.clearTimer();
    this.dirty.clear();
    this.set({ save: "saving" });
    void this.send(sent, true);
    return true;
  }

  /** Merges the server's copy: an element only replaces ours when its version is newer (another tab, a repair). */
  private adopt(raw: readonly unknown[]) {
    const incoming = restoreElements(raw).elements;
    const { merged, taken } = mergeElements(this.snapshot.elements, incoming);
    if (!taken.length) return;
    for (const id of taken) this.dirty.delete(id);
    this.set(this.derive(merged));
  }

  /** Picks up what other tabs saved. */
  async refresh() {
    try {
      const res = await api<{ elements: unknown[] }>(`/api/problems/${this.problemId}/sketch`);
      this.adopt(res.elements);
    } catch {}
  }
}

export function useSketch(store: SketchStore): SketchSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
