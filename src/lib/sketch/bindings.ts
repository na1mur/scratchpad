import { withChanges } from "./elements";
import { elementBounds, linePoints, nodeShape, type ElementMap, type Point, type Rect } from "./layout";
import type { ElementOf, LineBinding, SketchElement } from "./types";

/**
 * Arrows and lines attached to elements, as in Excalidraw (where a connector is an arrow, with or without heads):
 * drawn from one element to another, each end attaches, unless Ctrl or Cmd is held. An end with a binding sits on the bound element's outline, aimed
 * at the next point along the arrow (or, for a two-point arrow bound at both ends, at the other element's centre),
 * a small gap outside it. The stored points are kept in step: the store runs followBindings() on every commit, so
 * moving, resizing or growing an element redraws the arrows on it in the same undo entry.
 */

/** Space between a bound end and the outline, so the arrowhead stays visible. */
export const BIND_GAP = 6;

const BINDABLE = new Set<SketchElement["type"]>(["shape", "text", "note", "node", "array", "stack", "queue", "set", "matrix", "hashmap", "variables"]);

export type Outline = { kind: "rect" | "ellipse" | "diamond"; rect: Rect };

/** The outline an arrow can attach to; null for elements that take no arrows (lines, links, pointers, drawings). */
export function bindOutline(el: SketchElement): Outline | null {
  if (el.isDeleted || !BINDABLE.has(el.type)) return null;
  if (el.type === "shape") {
    return { kind: el.shape === "ellipse" ? "ellipse" : el.shape === "diamond" ? "diamond" : "rect", rect: { x: el.x, y: el.y, w: el.w, h: el.h } };
  }
  if (el.type === "node") {
    const s = nodeShape(el);
    return s.kind === "circle" ? { kind: "ellipse", rect: { x: s.cx - s.r, y: s.cy - s.r, w: s.r * 2, h: s.r * 2 } } : { kind: "rect", rect: s.rect };
  }
  const b = elementBounds(el);
  return b && { kind: "rect", rect: b };
}

export function outlineCenter(o: Outline): Point {
  return { x: o.rect.x + o.rect.w / 2, y: o.rect.y + o.rect.h / 2 };
}

/** How far along (dx, dy) from the centre the outline is, as a multiple of (dx, dy). */
function reach(o: Outline, dx: number, dy: number): number {
  const a = Math.max(o.rect.w / 2, 0.5);
  const b = Math.max(o.rect.h / 2, 0.5);
  switch (o.kind) {
    case "rect":
      return Math.min(dx ? a / Math.abs(dx) : Infinity, dy ? b / Math.abs(dy) : Infinity);
    case "ellipse":
      return 1 / Math.hypot(dx / a, dy / b);
    case "diamond":
      return 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
  }
}

/** Where a ray from the outline's centre toward `toward` leaves it, `gap` further out. */
export function outlinePoint(o: Outline, toward: Point, gap = BIND_GAP): Point {
  const c = outlineCenter(o);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  const len = Math.hypot(dx, dy);
  if (!len) return { x: c.x, y: o.rect.y - gap };
  const k = reach(o, dx, dy) + gap / len;
  return { x: c.x + dx * k, y: c.y + dy * k };
}

/** Whether `p` is inside the outline grown by `margin` on every side. */
function nearOutline(o: Outline, p: Point, margin: number): boolean {
  const c = outlineCenter(o);
  const a = o.rect.w / 2 + margin;
  const b = o.rect.h / 2 + margin;
  const nx = (p.x - c.x) / a;
  const ny = (p.y - c.y) / b;
  if (o.kind === "ellipse") return nx * nx + ny * ny <= 1;
  if (o.kind === "diamond") return Math.abs(nx) + Math.abs(ny) <= 1;
  return Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
}

/** The topmost element an arrow end at `p` would attach to: one whose outline is under `p` or within `margin`. */
export function bindTargetAt(live: readonly SketchElement[], p: Point, margin: number, exclude?: string | null): SketchElement | null {
  for (let i = live.length - 1; i >= 0; i--) {
    const el = live[i];
    if (el.id === exclude) continue;
    const o = bindOutline(el);
    if (o && nearOutline(o, p, margin)) return el;
  }
  return null;
}

function boundOutline(elements: ElementMap, binding: LineBinding | null | undefined): Outline | null {
  const el = binding && elements.get(binding.elementId);
  return el ? bindOutline(el) : null;
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * The line with its bound ends placed on their elements' outlines. An end bound to an element that's gone stays
 * where it was. Returns the same object when nothing moved.
 */
export function resolveLine(elements: ElementMap, el: ElementOf<"line">): ElementOf<"line"> {
  const start = boundOutline(elements, el.startBinding);
  const end = boundOutline(elements, el.endBinding);
  if (!start && !end) return el;
  const pts = linePoints(el);
  const n = pts.length;
  const startToward = n === 2 && end ? outlineCenter(end) : pts[1];
  const endToward = n === 2 && start ? outlineCenter(start) : pts[n - 2];
  if (start) pts[0] = outlinePoint(start, startToward);
  if (end) pts[n - 1] = outlinePoint(end, endToward);
  // Overlapping elements can put both ends on one spot; a line with no length would be dropped, so keep it as it was.
  if (pts.every((p) => Math.abs(p.x - pts[0].x) < 0.5 && Math.abs(p.y - pts[0].y) < 0.5)) return el;
  const points = pts.map((p) => [round(p.x - el.x), round(p.y - el.y)] as [number, number]);
  if (points.every(([x, y], i) => x === el.points[i][0] && y === el.points[i][1])) return el;
  return { ...el, points };
}

/** The line drawn as if it had no bindings to elements outside `moving` (a bound arrow dragged on its own comes loose). */
export function looseOutside(el: ElementOf<"line">, moving: ReadonlySet<string>): ElementOf<"line"> {
  const start = el.startBinding && !moving.has(el.startBinding.elementId) ? null : el.startBinding;
  const end = el.endBinding && !moving.has(el.endBinding.elementId) ? null : el.endBinding;
  return start === el.startBinding && end === el.endBinding ? el : { ...el, startBinding: start, endBinding: end };
}

/** Whether the line is bound to `id` at either end. */
export function boundTo(el: ElementOf<"line">, id: string): boolean {
  return el.startBinding?.elementId === id || el.endBinding?.elementId === id;
}

/**
 * New versions of the lines that need redrawing after `changed` were written into `elements`: lines bound to a
 * changed element, and changed lines with bindings.
 */
export function followBindings(elements: ElementMap, changed: ReadonlySet<string>): SketchElement[] {
  const out: SketchElement[] = [];
  for (const el of elements.values()) {
    if (el.type !== "line" || el.isDeleted || (!el.startBinding && !el.endBinding)) continue;
    const affected =
      changed.has(el.id) || (el.startBinding && changed.has(el.startBinding.elementId)) || (el.endBinding && changed.has(el.endBinding.elementId));
    if (!affected) continue;
    const resolved = resolveLine(elements, el);
    if (resolved !== el) out.push(withChanges(el, { points: resolved.points }));
  }
  return out;
}
