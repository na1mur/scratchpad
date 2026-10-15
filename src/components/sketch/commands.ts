"use client";

import {
  bringToFront,
  deleteElements,
  duplicateElements,
  moveElements,
  sendToBack,
} from "@/lib/sketch/actions";
import { GRID, elementBounds, snap, unionRect, type Point } from "@/lib/sketch/layout";
import { sortByOrder } from "@/lib/sketch/order";
import { instantiate } from "@/lib/sketch/templates";
import { isCells, isTable, type NewElement, type SketchElement } from "@/lib/sketch/types";
import type { EditTarget, SketchStore } from "./store";

/**
 * What the keyboard, the toolbars and the palette do, in one place. Each reads the store's current state and
 * commits one undoable change.
 */

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 3;

/** The scene point at the middle of the canvas. */
export function viewCenter(store: SketchStore): Point {
  const { camera } = store.state;
  return { x: store.viewport.w / 2 / camera.zoom - camera.x, y: store.viewport.h / 2 / camera.zoom - camera.y };
}

let lastDrop: { at: Point; count: number } | null = null;

/**
 * Places a template or a pasted set with its top-left corner at `at` (the middle of the view by default). Repeated
 * drops at the same spot step down and right, so they don't stack exactly.
 */
export function insertElements(store: SketchStore, elements: readonly (NewElement | SketchElement)[], at?: Point) {
  const positioned = elements.filter((el) => el.type !== "link");
  if (!positioned.length) return;
  const minX = Math.min(...positioned.map((el) => el.x));
  const minY = Math.min(...positioned.map((el) => el.y));
  let target = at ?? viewCenter(store);
  if (!at) {
    const same = lastDrop && Math.hypot(lastDrop.at.x - target.x, lastDrop.at.y - target.y) < 1;
    lastDrop = { at: target, count: same ? lastDrop!.count + 1 : 0 };
    target = { x: target.x - 60 + lastDrop.count * 24, y: target.y - 40 + lastDrop.count * 24 };
  }
  const placed = instantiate(elements, { x: snap(target.x) - minX, y: snap(target.y) - minY }, store.lastKey);
  store.commit(placed, { select: placed.filter((el) => el.type !== "link").map((el) => el.id) });
  store.setTool("select");
}

export function deleteSelection(store: SketchStore) {
  const { elements, selection } = store.state;
  if (selection.size) store.commit(deleteElements(elements, selection), { select: [] });
}

export function duplicateSelection(store: SketchStore) {
  const { elements, selection } = store.state;
  if (!selection.size) return;
  const copies = duplicateElements(elements, selection, store.lastKey);
  store.commit(copies, { select: copies.filter((el) => el.type !== "link").map((el) => el.id) });
}

/** Copied elements live for the session, like the Playground drafts. */
let clipboard: SketchElement[] = [];
let pasteCount = 0;

export function copySelection(store: SketchStore) {
  const { elements, selection } = store.state;
  if (!selection.size) return;
  clipboard = sortByOrder(
    [...elements.values()].filter(
      (el) =>
        !el.isDeleted &&
        (el.type === "link" ? selection.has(el.from.elementId) && (!el.to || selection.has(el.to.elementId)) : selection.has(el.id)),
    ),
  );
  pasteCount = 0;
}

export function cutSelection(store: SketchStore) {
  copySelection(store);
  deleteSelection(store);
}

export function paste(store: SketchStore) {
  if (!clipboard.length) return;
  pasteCount++;
  const copies = instantiate(clipboard, { x: pasteCount * 24, y: pasteCount * 24 }, store.lastKey);
  store.commit(copies, { select: copies.filter((el) => el.type !== "link").map((el) => el.id) });
}

export function nudge(store: SketchStore, dx: number, dy: number) {
  const { elements, selection } = store.state;
  if (selection.size) store.commit(moveElements(elements, selection, dx, dy));
}

export function arrange(store: SketchStore, to: "front" | "back") {
  const { elements, selection } = store.state;
  if (!selection.size) return;
  store.commit(to === "front" ? bringToFront(elements, selection, store.lastKey) : sendToBack(elements, selection, store.firstKey));
}

export function selectAll(store: SketchStore) {
  store.select(store.state.live.filter((el) => el.type !== "link").map((el) => el.id));
}

/** Tab through the elements in drawing order (links are reached by clicking them). */
export function cycleSelection(store: SketchStore, back: boolean) {
  const items = store.state.live.filter((el) => el.type !== "link");
  if (!items.length) return;
  const current = items.findIndex((el) => store.state.selection.has(el.id));
  const next = current < 0 ? (back ? items.length - 1 : 0) : (current + (back ? -1 : 1) + items.length) % items.length;
  store.select([items[next].id]);
  revealElement(store, items[next]);
}

/** Pans just enough to bring the element into view. */
export function revealElement(store: SketchStore, el: SketchElement) {
  const b = elementBounds(el);
  if (!b) return;
  const { camera } = store.state;
  const { w, h } = store.viewport;
  const left = (b.x + camera.x) * camera.zoom;
  const top = (b.y + camera.y) * camera.zoom;
  const right = left + b.w * camera.zoom;
  const bottom = top + b.h * camera.zoom;
  const margin = 40;
  let dx = 0;
  let dy = 0;
  if (left < margin) dx = margin - left;
  else if (right > w - margin) dx = w - margin - right;
  if (top < margin) dy = margin - top;
  else if (bottom > h - margin) dy = h - margin - bottom;
  if (dx || dy) store.setCamera({ ...camera, x: camera.x + dx / camera.zoom, y: camera.y + dy / camera.zoom });
}

/** Starts typing into the selected element: its active cell, first entry, value, text or name. */
export function startEditing(store: SketchStore) {
  const { selection, elements, activeCell } = store.state;
  if (selection.size !== 1) return;
  const el = elements.get([...selection][0]);
  if (!el) return;
  let target: EditTarget | null = null;
  if (isCells(el)) {
    if (el.values.length) target = { kind: "cell", elementId: el.id, index: activeCell?.elementId === el.id ? activeCell.index : 0 };
  } else if (isTable(el)) {
    if (el.entries.length) target = { kind: "entry", elementId: el.id, row: 0, part: 0 };
  } else if (el.type === "matrix") target = { kind: "matrixCell", elementId: el.id, row: 0, col: 0 };
  else if (el.type === "node") target = { kind: "value", elementId: el.id };
  else if (el.type === "note" || el.type === "text") target = { kind: "text", elementId: el.id };
  else if (el.type === "pointer") target = { kind: "name", elementId: el.id };
  if (target) store.setEditing(target);
}

/** Zooms by `factor`, keeping the point under `screen` (canvas coordinates) where it is. */
export function zoomAt(store: SketchStore, factor: number, screen?: Point) {
  const { camera } = store.state;
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom * factor));
  const s = screen ?? { x: store.viewport.w / 2, y: store.viewport.h / 2 };
  const scene = { x: s.x / camera.zoom - camera.x, y: s.y / camera.zoom - camera.y };
  store.setCamera({ zoom, x: s.x / zoom - scene.x, y: s.y / zoom - scene.y });
}

export function resetZoom(store: SketchStore) {
  zoomAt(store, 1 / store.state.camera.zoom);
}

/** Fits every element in view (not above 100%). With nothing drawn, goes back to the origin. */
export function zoomToFit(store: SketchStore) {
  const rects = store.state.live.flatMap((el) => {
    const b = elementBounds(el);
    return b ? [b] : [];
  });
  const all = unionRect(rects);
  const { w, h } = store.viewport;
  if (!all || !w || !h) {
    store.setCamera({ x: GRID * 6, y: GRID * 6, zoom: 1 });
    return;
  }
  const pad = 64;
  const zoom = Math.min(1, Math.max(MIN_ZOOM, Math.min((w - pad * 2) / all.w, (h - pad * 2) / all.h)));
  store.setCamera({ zoom, x: (w / zoom - all.w) / 2 - all.x, y: (h / zoom - all.h) / 2 - all.y });
}
