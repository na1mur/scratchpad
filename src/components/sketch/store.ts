"use client";

import { useSyncExternalStore } from "react";
import { ApiClientError, api } from "@/lib/fetcher";
import { mergeElements } from "@/lib/sketch/elements";
import { History, type HistoryEntry } from "@/lib/sketch/history";
import type { Point, Rect, Shape } from "@/lib/sketch/layout";
import { sortByOrder } from "@/lib/sketch/order";
import { restoreElements } from "@/lib/sketch/restore";
import type { SketchElement } from "@/lib/sketch/types";

/**
 * The sketch page's state, outside React so pointer moves don't go through component state. Components read it
 * with useSketch(). Every edit goes through commit(), which records one undo entry and schedules a save of the
 * changed elements; the server merges them and answers with the whole sketch, which is merged back by version.
 */

export type Tool = "select" | "hand" | "pointer" | "link" | "freehand" | "note" | "text";

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
  overlay: Overlay | null;
  canUndo: boolean;
  canRedo: boolean;
  save: SaveStatus;
  saveError: string | null;
};

const SAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

export class SketchStore {
  private snapshot: SketchSnapshot;
  private listeners = new Set<() => void>();
  private history = new History();
  private dirty = new Set<string>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving = false;
  private saveAgain = false;
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
    for (const el of changes) {
      entry.set(el.id, { before: entry.get(el.id)?.before ?? prev.get(el.id), after: el });
      elements.set(el.id, el);
      this.dirty.add(el.id);
    }
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

  // Saving

  private scheduleSave() {
    if (this.snapshot.save !== "saving") this.set({ save: "pending", saveError: null });
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.flush(), SAVE_DELAY_MS);
  }

  /** Sends the changed elements now. `keepalive` lets it finish while the page unloads. */
  async flush(opts: { keepalive?: boolean } = {}) {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.saving) {
      this.saveAgain = true;
      return;
    }
    if (!this.dirty.size) return;
    const sent = [...this.dirty].flatMap((id) => {
      const el = this.snapshot.elements.get(id);
      return el ? [el] : [];
    });
    this.dirty.clear();
    this.saving = true;
    this.set({ save: "saving" });
    try {
      const res = await api<{ elements: unknown[] }>(`/api/problems/${this.problemId}/sketch`, {
        method: "PUT",
        body: { elements: sent },
        keepalive: opts.keepalive,
      });
      this.adopt(res.elements);
      this.set({ save: this.dirty.size ? "pending" : "saved", saveError: null });
    } catch (err) {
      // Whatever didn't change since is still unsaved.
      for (const el of sent) if (this.snapshot.elements.get(el.id)?.version === el.version) this.dirty.add(el.id);
      const permanent = err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 409;
      this.set({ save: "error", saveError: err instanceof Error ? err.message : "Couldn't save." });
      if (!permanent) {
        if (this.saveTimer) clearTimeout(this.saveTimer);
        this.saveTimer = setTimeout(() => void this.flush(), RETRY_DELAY_MS);
      }
    } finally {
      this.saving = false;
      if (this.saveAgain) {
        this.saveAgain = false;
        void this.flush();
      }
    }
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

  get hasUnsaved() {
    return this.dirty.size > 0 || this.saving;
  }
}

export function useSketch(store: SketchStore): SketchSnapshot {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
