import { isCells, isTable, type Anchor, type CellsElement, type ElementOf, type LinkPort, type SketchElement, type TableElement } from "./types";

/**
 * Geometry, in scene units. Every size follows from the element's content, so the renderer draws exactly these
 * rectangles and arrows can be placed without measuring the DOM. Text is monospace at CHAR_W per character.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Shape = { kind: "rect"; rect: Rect } | { kind: "circle"; cx: number; cy: number; r: number };

export const GRID = 8;
export const CHAR_W = 8;
export const LABEL_H = 20;
export const CELL_H = 40;
export const MIN_CELL_W = 40;
export const INDEX_H = 18;
export const ROW_H = 30;
export const ROW_LABEL_W = 22;
export const NODE_D = 44;
export const LIST_NODE_H = 40;
export const POINTER_H = 22;
export const NOTE_W = 200;
export const NULL_LINK_LENGTH = 40;
export const TEXT_SIZE_PX = { s: 14, m: 18, l: 26 } as const;

const chars = (s: string) => [...s].length;
const textW = (s: string) => chars(s) * CHAR_W;

export const snap = (v: number) => Math.round(v / GRID) * GRID;

/** One width for all of a structure's cells, wide enough for the longest value. */
export function cellWidth(values: readonly string[]): number {
  return Math.max(MIN_CELL_W, 16 + Math.max(0, ...values.map(chars)) * CHAR_W);
}

function labelWidth(label: string): number {
  return label ? textW(label) + 8 : 0;
}

/** Where cell `i` of a row or stack is, also for an index outside the cells (a pointer that ran off the end). */
export function cellRect(el: CellsElement, i: number): Rect {
  const w = cellWidth(el.values);
  const top = el.y + LABEL_H;
  if (el.type === "stack") {
    const n = Math.max(el.values.length, 1);
    return { x: el.x, y: top + (n - 1 - i) * CELL_H, w, h: CELL_H };
  }
  return { x: el.x + i * w, y: top, w, h: CELL_H };
}

/** Whether the structure has a row under its cells: indexes for an array, front/back for a queue. */
export function hasIndexRow(el: CellsElement): boolean {
  return el.type === "array" || el.type === "queue";
}

/** The area a pointer to cell `i` lands on: the cell, and its index under it. */
function cellColumn(el: CellsElement, i: number): Rect {
  const r = cellRect(el, i);
  return hasIndexRow(el) ? { ...r, h: r.h + INDEX_H } : r;
}

function matrixCellW(el: ElementOf<"matrix">): number {
  return cellWidth(el.rows.flat());
}

export function matrixCellRect(el: ElementOf<"matrix">, row: number, col: number): Rect {
  const w = matrixCellW(el);
  return { x: el.x + ROW_LABEL_W + col * w, y: el.y + LABEL_H + INDEX_H + row * CELL_H, w, h: CELL_H };
}

export function tableColumns(el: TableElement): { keyW: number; valueW: number } {
  return {
    keyW: Math.max(48, 16 + Math.max(0, ...el.entries.map(([k]) => chars(k))) * CHAR_W),
    valueW: Math.max(48, 16 + Math.max(0, ...el.entries.map(([, v]) => chars(v))) * CHAR_W),
  };
}

export function tableRowRect(el: TableElement, row: number): Rect {
  const { keyW, valueW } = tableColumns(el);
  return { x: el.x, y: el.y + LABEL_H + row * ROW_H, w: keyW + valueW, h: ROW_H };
}

export function nodeSize(el: ElementOf<"node">): { w: number; h: number } {
  if (el.variant === "list") return { w: Math.max(52, 24 + textW(el.value)), h: LIST_NODE_H };
  const d = Math.max(NODE_D, 20 + textW(el.value));
  return { w: d, h: d };
}

export function nodeShape(el: ElementOf<"node">): Shape {
  const { w, h } = nodeSize(el);
  if (el.variant === "list") return { kind: "rect", rect: { x: el.x, y: el.y, w, h } };
  return { kind: "circle", cx: el.x + w / 2, cy: el.y + h / 2, r: w / 2 };
}

export function pointerLabelRect(el: ElementOf<"pointer">): Rect {
  return { x: el.x, y: el.y, w: textW(el.name) + 16, h: POINTER_H };
}

function wrappedLines(text: string, perLine: number): number {
  return text.split("\n").reduce((n, line) => n + Math.max(1, Math.ceil(chars(line) / perLine)), 0);
}

/** A note's height grows with its text (the renderer wraps at the same width). */
export function noteHeight(text: string): number {
  return 20 + wrappedLines(text || " ", Math.floor((NOTE_W - 20) / 7)) * 20;
}

export function textBox(el: ElementOf<"text">): { w: number; h: number } {
  const px = TEXT_SIZE_PX[el.size];
  const lines = (el.text || " ").split("\n");
  return { w: Math.max(px, ...lines.map((l) => chars(l) * px * 0.6)) + 4, h: lines.length * px * 1.35 };
}

function freehandBounds(el: ElementOf<"freehand">): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of el.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return { x: el.x + minX - 4, y: el.y + minY - 4, w: maxX - minX + 8, h: maxY - minY + 8 };
}

/** The element's box, for selection outlines and marquee selection. Null for links, which have no box. */
export function elementBounds(el: SketchElement): Rect | null {
  if (isCells(el)) {
    const w = cellWidth(el.values);
    const n = Math.max(el.values.length, 1);
    const lw = labelWidth(el.label);
    if (el.type === "stack") return { x: el.x, y: el.y, w: Math.max(w, lw), h: LABEL_H + n * CELL_H };
    return { x: el.x, y: el.y, w: Math.max(n * w, lw), h: LABEL_H + CELL_H + (hasIndexRow(el) ? INDEX_H : 0) };
  }
  if (isTable(el)) {
    const { keyW, valueW } = tableColumns(el);
    return { x: el.x, y: el.y, w: Math.max(keyW + valueW, labelWidth(el.label)), h: LABEL_H + Math.max(1, el.entries.length) * ROW_H };
  }
  switch (el.type) {
    case "matrix": {
      const cols = Math.max(...el.rows.map((r) => r.length));
      return {
        x: el.x,
        y: el.y,
        w: Math.max(ROW_LABEL_W + cols * matrixCellW(el), labelWidth(el.label)),
        h: LABEL_H + INDEX_H + el.rows.length * CELL_H,
      };
    }
    case "node":
      return { x: el.x, y: el.y, ...nodeSize(el) };
    case "pointer":
      return pointerLabelRect(el);
    case "note":
      return { x: el.x, y: el.y, w: NOTE_W, h: noteHeight(el.text) };
    case "text":
      return { x: el.x, y: el.y, ...textBox(el) };
    case "freehand":
      return freehandBounds(el);
    case "link":
      return null;
  }
}

export function center(shape: Shape): Point {
  return shape.kind === "circle" ? { x: shape.cx, y: shape.cy } : { x: shape.rect.x + shape.rect.w / 2, y: shape.rect.y + shape.rect.h / 2 };
}

/** Where a line from the shape's centre toward `toward` leaves the shape. */
export function boundaryPoint(shape: Shape, toward: Point): Point {
  const c = center(shape);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  if (shape.kind === "circle") {
    const len = Math.hypot(dx, dy);
    return { x: c.x + (dx / len) * shape.r, y: c.y + (dy / len) * shape.r };
  }
  const t = Math.min(dx ? shape.rect.w / 2 / Math.abs(dx) : Infinity, dy ? shape.rect.h / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

export type ElementMap = ReadonlyMap<string, SketchElement>;

function live(elements: ElementMap, id: string): SketchElement | undefined {
  const el = elements.get(id);
  return el && !el.isDeleted ? el : undefined;
}

/** The shape a pointer's anchor lands on, or null when it no longer resolves. */
export function anchorShape(elements: ElementMap, anchor: Anchor): Shape | null {
  const el = live(elements, anchor.elementId);
  if (!el) return null;
  switch (anchor.kind) {
    case "cell":
      return isCells(el) ? { kind: "rect", rect: cellColumn(el, anchor.index) } : null;
    case "cellAt":
      return el.type === "matrix" ? { kind: "rect", rect: matrixCellRect(el, anchor.row, anchor.col) } : null;
    case "entry": {
      if (!isTable(el)) return null;
      const row = el.entries.findIndex(([k]) => k === anchor.key);
      return row >= 0 ? { kind: "rect", rect: tableRowRect(el, row) } : null;
    }
    case "node":
      return el.type === "node" ? nodeShape(el) : null;
  }
}

/** Whether a pointer's index is outside its structure (drawn in red: it ran off the end). */
export function isOutOfRange(elements: ElementMap, anchor: Anchor): boolean {
  if (anchor.kind !== "cell") return false;
  const el = live(elements, anchor.elementId);
  return Boolean(el && isCells(el) && (anchor.index < 0 || anchor.index >= el.values.length));
}

export type Segment = { from: Point; to: Point };

export function pointerSegment(elements: ElementMap, el: ElementOf<"pointer">): Segment | null {
  const label: Shape = { kind: "rect", rect: pointerLabelRect(el) };
  const target = el.target ? anchorShape(elements, el.target) : null;
  if (target) {
    return { from: boundaryPoint(label, center(target)), to: boundaryPoint(target, center(label)) };
  }
  if (!el.end) return null;
  return { from: boundaryPoint(label, el.end), to: el.end };
}

const NULL_DIRECTION: Record<LinkPort, Point> = {
  next: { x: 1, y: 0 },
  left: { x: -0.55, y: 0.83 },
  right: { x: 0.55, y: 0.83 },
  edge: { x: 1, y: 0 },
};

/** A link's line. `toNull` when it points at null, which is drawn at the end. */
export function linkSegment(elements: ElementMap, el: ElementOf<"link">): (Segment & { toNull: boolean }) | null {
  const from = live(elements, el.from.elementId);
  if (!from || from.type !== "node") return null;
  const fromShape = nodeShape(from);
  if (!el.to) {
    const d = NULL_DIRECTION[el.from.port];
    const start = boundaryPoint(fromShape, { x: center(fromShape).x + d.x * 100, y: center(fromShape).y + d.y * 100 });
    return { from: start, to: { x: start.x + d.x * NULL_LINK_LENGTH, y: start.y + d.y * NULL_LINK_LENGTH }, toNull: true };
  }
  const to = live(elements, el.to.elementId);
  if (!to || to.type !== "node") return null;
  const toShape = nodeShape(to);
  return { from: boundaryPoint(fromShape, center(toShape)), to: boundaryPoint(toShape, center(fromShape)), toNull: false };
}

/** Every place a pointer can bind to on this element. Rows get one slot before and after the cells. */
export function anchorsOf(el: SketchElement): Anchor[] {
  if (isCells(el)) {
    const out: Anchor[] = [];
    for (let i = -1; i <= el.values.length; i++) out.push({ kind: "cell", elementId: el.id, index: i });
    return out;
  }
  if (isTable(el)) return el.entries.map(([key]) => ({ kind: "entry", elementId: el.id, key }));
  if (el.type === "matrix") {
    return el.rows.flatMap((row, r) => row.map((_, c) => ({ kind: "cellAt", elementId: el.id, row: r, col: c }) as const));
  }
  if (el.type === "node") return [{ kind: "node", elementId: el.id }];
  return [];
}

function distanceToShape(shape: Shape, p: Point): number {
  if (shape.kind === "circle") return Math.max(0, Math.hypot(p.x - shape.cx, p.y - shape.cy) - shape.r);
  const { x, y, w, h } = shape.rect;
  const dx = Math.max(x - p.x, 0, p.x - (x + w));
  const dy = Math.max(y - p.y, 0, p.y - (y + h));
  return Math.hypot(dx, dy);
}

/**
 * The anchor nearest to `p` within `tolerance` scene units. A slot outside the cells only wins when the point
 * is on it, so aiming near the end of a row picks the last cell.
 */
export function nearestAnchor(
  elements: ElementMap,
  candidates: readonly SketchElement[],
  p: Point,
  tolerance: number,
): { anchor: Anchor; shape: Shape } | null {
  let best: { anchor: Anchor; shape: Shape; d: number } | null = null;
  for (const el of candidates) {
    for (const anchor of anchorsOf(el)) {
      const shape = anchorShape(elements, anchor);
      if (!shape) continue;
      const d = distanceToShape(shape, p);
      const outside = isOutOfRange(elements, anchor);
      if (d > (outside ? 0 : tolerance)) continue;
      if (!best || d < best.d) best = { anchor, shape, d };
    }
  }
  return best && { anchor: best.anchor, shape: best.shape };
}

/** The node under `p`, topmost first. */
export function nodeAt(candidates: readonly SketchElement[], p: Point, tolerance: number): ElementOf<"node"> | null {
  for (let i = candidates.length - 1; i >= 0; i--) {
    const el = candidates[i];
    if (el.type === "node" && distanceToShape(nodeShape(el), p) <= tolerance) return el;
  }
  return null;
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function unionRect(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map((r) => r.x + r.w)) - x, h: Math.max(...rects.map((r) => r.y + r.h)) - y };
}
