"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { connect, createPointer, movedBy, moveElements, pointerLabelFor, portToward } from "@/lib/sketch/actions";
import { bindOutline, bindTargetAt, looseOutside, resolveLine, type Outline } from "@/lib/sketch/bindings";
import { describeElement } from "@/lib/sketch/describe";
import { createElement, randomId, withChanges } from "@/lib/sketch/elements";
import {
  center,
  elementBounds,
  isOutOfRange,
  nearestAnchor,
  nodeAt,
  nodeShape,
  pointerLabelRect,
  fittedShapeHeight,
  resizeRect,
  shapeAt,
  snap,
  snapAngle,
  type ElementMap,
  type Point,
  type ResizeHandle,
  type Shape,
} from "@/lib/sketch/layout";
import { keysAfter } from "@/lib/sketch/order";
import { dropTargetShape, partById, partDropTarget, type PartDrop } from "@/lib/sketch/parts";
import { PALETTE_KINDS, template, type PaletteKind } from "@/lib/sketch/templates";
import { styleFields } from "@/lib/sketch/style";
import { MIN_SHAPE_SIZE, type Anchor, type ElementOf, type SketchElement } from "@/lib/sketch/types";
import {
  arrange,
  copySelection,
  cutSelection,
  cycleSelection,
  deleteSelection,
  duplicateSelection,
  insertElements,
  nudge,
  paste,
  resetZoom,
  selectAll,
  startEditing,
  zoomAt,
  zoomToFit,
} from "./commands";
import { Connectors } from "./connectors";
import { InlineEditor } from "./editor";
import { ElementView, PointerLabel, SelectionHandles } from "./elements";
import { ElementToolbar } from "./ElementToolbar";
import { LIBRARY_IMAGE_MIME, libraryImage, placeImage, uploadImages } from "./libraryStore";
import { PALETTE_PART_MIME, draggedPart, runPart, setDraggedPart } from "./partCommands";
import { sketchFonts } from "./fonts";
import { useSketch, type Camera, type ShapeTool, type SketchStore, type Tool } from "./store";
import { StylePanel } from "./StylePanel";

/** The drag type the palette uses, so the canvas only accepts its own items. */
export const PALETTE_MIME = "application/x-scratchpad-sketch";

const DRAG_THRESHOLD = 3;
/** How close, in screen pixels, a pointer or link has to be dropped to snap to its target. */
const SNAP_PX = 24;
/** How close, in screen pixels, an arrow's end has to be to an element's outline to attach to it. */
const BIND_PX = 12;

type Gesture =
  | { kind: "pan"; start: Point; camera: Camera }
  | { kind: "pinch"; distance: number; mid: Point; camera: Camera }
  | { kind: "move"; origin: Point; start: Point; clicked: string; ids: Set<string>; moving: Set<string>; moved: boolean; additive: boolean }
  | { kind: "marquee"; origin: Point; base: Set<string> }
  | { kind: "pointer"; origin: Point; start: Point; clickAnchor: Anchor | null; moved: boolean }
  | { kind: "aim"; pointerId: string }
  | { kind: "link"; fromId: string }
  | { kind: "draw"; points: [number, number, number][] }
  /**
   * Drawing a shape or line from `origin`; `id` and `key` stay the same across the preview and the commit. An
   * arrow's ends attach to the elements they start and end on (`startBind`, `endBind`).
   */
  | {
      kind: "shape";
      tool: ShapeTool;
      origin: Point;
      start: Point;
      id: string;
      key: string;
      moved: boolean;
      startBind: string | null;
      endBind: string | null;
    }
  | { kind: "resize"; original: ElementOf<"shape" | "image">; handle: ResizeHandle; origin: Point }
  | { kind: "endpoint"; original: ElementOf<"line">; end: "start" | "end"; origin: Point };

type Hit = {
  id: string;
  cell: number | null;
  row: number | null;
  col: number | null;
  entry: number | null;
  part: 0 | 1 | null;
  label: boolean;
  handle: string | null;
};

const num = (node: Element | null, attr: string): number | null => {
  const v = node?.closest(`[${attr}]`)?.getAttribute(attr);
  return v === undefined || v === null || v === "" ? null : Number(v);
};

/** What the pointer went down on, read from the `data-*` attributes the elements carry. */
function hitOf(target: EventTarget | null): Hit | null {
  if (!(target instanceof Element)) return null;
  const owner = target.closest("[data-el]");
  if (!owner) return null;
  const part = num(target, "data-part");
  return {
    id: owner.getAttribute("data-el")!,
    cell: num(target, "data-cell"),
    row: num(target, "data-row"),
    col: num(target, "data-col"),
    entry: num(target, "data-entry"),
    part: part === 0 || part === 1 ? part : null,
    label: Boolean(target.closest("[data-label]")),
    handle: target.closest("[data-handle]")?.getAttribute("data-handle") ?? null,
  };
}

/** The anchor a click on this part of an element means (the cell, the entry, the node). */
function anchorOf(elements: ElementMap, hit: Hit | null): Anchor | null {
  if (!hit) return null;
  const el = elements.get(hit.id);
  if (!el) return null;
  if (hit.cell !== null) return { kind: "cell", elementId: el.id, index: hit.cell };
  if (hit.row !== null && hit.col !== null) return { kind: "cellAt", elementId: el.id, row: hit.row, col: hit.col };
  if (hit.entry !== null && (el.type === "hashmap" || el.type === "variables")) {
    const key = el.entries[hit.entry]?.[0];
    return key === undefined ? null : { kind: "entry", elementId: el.id, key };
  }
  if (el.type === "node") return { kind: "node", elementId: el.id };
  return null;
}

const TOOL_KEYS: Record<string, Tool> = {
  v: "select",
  h: "hand",
  p: "pointer",
  l: "link",
  d: "freehand",
  n: "note",
  t: "text",
  // Shapes: mnemonic letters where they're free, and Excalidraw's number keys.
  r: "rectangle",
  "2": "rectangle",
  u: "rounded",
  "3": "diamond",
  o: "ellipse",
  "4": "ellipse",
  a: "arrow",
  "5": "arrow",
  i: "line",
  "6": "line",
};

const CURSOR: Record<Tool, string> = {
  select: "cursor-default",
  hand: "cursor-grab",
  pointer: "cursor-crosshair",
  link: "cursor-crosshair",
  freehand: "cursor-crosshair",
  note: "cursor-copy",
  text: "cursor-text",
  rectangle: "cursor-crosshair",
  rounded: "cursor-crosshair",
  diamond: "cursor-crosshair",
  ellipse: "cursor-crosshair",
  arrow: "cursor-crosshair",
  line: "cursor-crosshair",
};

/** A click without a drag makes a shape this size, centred on the click. */
const DEFAULT_SHAPE = { w: 160, h: 80 };
const DEFAULT_LINE = 160;

/**
 * The shape or line a drawing gesture makes when the pointer is at `p`: snapped to the grid, or with Shift, a
 * square or circle (shapes) or an angle in 15° steps (lines). `p` null: a click, which makes a default-size one.
 */
function drawnElement(store: SketchStore, g: Extract<Gesture, { kind: "shape" }>, p: Point | null, shift: boolean): SketchElement {
  const style = store.state.newStyle;
  const o = g.origin;
  if (g.tool === "line" || g.tool === "arrow") {
    const end = !p ? { x: o.x + DEFAULT_LINE, y: o.y } : shift ? snapAngle(o, p) : { x: snap(p.x), y: snap(p.y) };
    // The arrow tool keeps the heads last picked, and always draws at least one.
    const heads =
      g.tool === "arrow"
        ? { startHead: style.startHead, endHead: style.startHead === "none" && style.endHead === "none" ? ("arrow" as const) : style.endHead }
        : {};
    const bindings = {
      startBinding: g.startBind ? { elementId: g.startBind } : null,
      endBinding: p && g.endBind ? { elementId: g.endBind } : null,
    };
    const line = createElement(
      { id: g.id, type: "line", x: o.x, y: o.y, points: [[0, 0], [end.x - o.x, end.y - o.y]], ...styleFields("line", style), ...heads, ...bindings },
      g.key,
    ) as ElementOf<"line">;
    return resolveLine(store.state.elements, line);
  }
  let rect;
  if (!p) {
    rect = { x: snap(o.x - DEFAULT_SHAPE.w / 2), y: snap(o.y - DEFAULT_SHAPE.h / 2), ...DEFAULT_SHAPE };
  } else {
    let w = snap(p.x) - o.x;
    let h = snap(p.y) - o.y;
    if (shift) {
      const d = Math.max(Math.abs(w), Math.abs(h));
      w = (w < 0 ? -1 : 1) * d;
      h = (h < 0 ? -1 : 1) * d;
    }
    rect = { x: Math.min(o.x, o.x + w), y: Math.min(o.y, o.y + h), w: Math.max(MIN_SHAPE_SIZE, Math.abs(w)), h: Math.max(MIN_SHAPE_SIZE, Math.abs(h)) };
  }
  return createElement({ id: g.id, type: "shape", shape: g.tool, ...rect, text: "", ...styleFields("shape", style) }, g.key);
}

/** The point a resize handle drags: the corner or the middle of the edge it sits on. */
function handlePoint(el: ElementOf<"shape" | "image">, handle: ResizeHandle): Point {
  const x = handle.includes("w") ? el.x : handle.includes("e") ? el.x + el.w : el.x + el.w / 2;
  const y = handle.includes("n") ? el.y : handle.includes("s") ? el.y + el.h : el.y + el.h / 2;
  return { x, y };
}

/** The outline of the element an arrow's end would attach to, a little outside it. */
function BindHint({ outline }: { outline: Outline }) {
  const pad = 4;
  const { x, y, w, h } = outline.rect;
  const W = w + pad * 2;
  const H = h + pad * 2;
  return (
    <svg
      data-export-skip=""
      className="pointer-events-none absolute z-10 overflow-visible fill-brand/10 stroke-brand"
      style={{ left: x - pad, top: y - pad }}
      width={W}
      height={H}
      strokeWidth={2}
      aria-hidden
    >
      {outline.kind === "ellipse" ? (
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2} ry={H / 2} />
      ) : outline.kind === "diamond" ? (
        <path d={`M ${W / 2} 0 L ${W} ${H / 2} L ${W / 2} ${H} L 0 ${H / 2} Z`} />
      ) : (
        <rect width={W} height={H} rx={6} />
      )}
    </svg>
  );
}

/** The element with a drag's offset applied, for drawing while the drag is in progress. */
function shifted(el: SketchElement, dx: number, dy: number): SketchElement {
  if (el.type === "link") return el;
  if (el.type === "pointer" && el.end) return { ...el, x: el.x + dx, y: el.y + dy, end: { x: el.end.x + dx, y: el.end.y + dy } };
  return { ...el, x: el.x + dx, y: el.y + dy };
}

export function SketchCanvas({ store, readOnly }: { store: SketchStore; readOnly: boolean }) {
  const s = useSketch(store);
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const space = useRef(false);
  /** Mirrors `space` and the pan gesture so the cursor can show an open or closed hand. */
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [panning, setPanning] = useState(false);
  const holdSpace = (down: boolean) => {
    space.current = down;
    setSpaceHeld(down);
  };
  const touches = useRef(new Map<number, Point>());
  /** What a palette part dragged over the canvas, or a pointer's name being dragged, would attach to. */
  const [dropShape, setDropShape] = useState<Shape | null>(null);
  const showDropShape = (shape: Shape | null) => {
    if (JSON.stringify(shape) !== JSON.stringify(dropShape)) setDropShape(shape);
  };
  /** The element an arrow's end would attach to: under the arrow tool, or an end being drawn or dragged. */
  const [bindHint, setBindHint] = useState<{ outline: Outline; hover: boolean } | null>(null);
  const showBindHint = (el: SketchElement | null, hover = false) => {
    const outline = el && bindOutline(el);
    const next = outline && { outline, hover };
    if (JSON.stringify(next) !== JSON.stringify(bindHint)) setBindHint(next);
  };

  useEffect(() => {
    const node = ref.current!;
    const resize = new ResizeObserver(([entry]) => {
      const first = store.viewport.w === 0;
      store.viewport = { w: entry.contentRect.width, h: entry.contentRect.height };
      // Open on everything that's there, once the canvas has a size.
      if (first) zoomToFit(store);
    });
    resize.observe(node);
    // Trackpad: two fingers pan, pinch (sent as ctrl+wheel) zooms. React's wheel listener is passive.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = node.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(store, Math.exp(-e.deltaY * 0.01), { x: e.clientX - rect.left, y: e.clientY - rect.top });
      } else {
        const { camera } = store.state;
        const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
        store.setCamera({ ...camera, x: camera.x - dx / camera.zoom, y: camera.y - dy / camera.zoom });
      }
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      resize.disconnect();
      node.removeEventListener("wheel", onWheel);
    };
  }, [store]);

  const toScene = (clientX: number, clientY: number): Point => {
    const rect = ref.current!.getBoundingClientRect();
    const { camera } = store.state;
    return { x: (clientX - rect.left) / camera.zoom - camera.x, y: (clientY - rect.top) / camera.zoom - camera.y };
  };

  const tolerance = () => SNAP_PX / store.state.camera.zoom;
  const bindMargin = () => BIND_PX / store.state.camera.zoom;

  /**
   * The cell or node a lone pointer's name was dragged onto, when that's somewhere other than where it points:
   * dropping it there points it there.
   */
  function rebindTarget(g: Extract<Gesture, { kind: "move" }>, p: Point): { pointer: ElementOf<"pointer">; anchor: Anchor; shape: Shape } | null {
    if (g.ids.size !== 1) return null;
    const st = store.state;
    const el = st.elements.get(g.clicked);
    if (el?.type !== "pointer" || !g.ids.has(el.id)) return null;
    const found = nearestAnchor(st.elements, st.live, p, 0);
    if (!found || (el.target && JSON.stringify(el.target) === JSON.stringify(found.anchor))) return null;
    return { pointer: el, ...found };
  }

  /** Where a palette part is being dragged: the scene point, and the element and anchor under it or nearby. */
  function partDropOf(e: React.DragEvent): PartDrop {
    const st = store.state;
    const point = toScene(e.clientX, e.clientY);
    const hit = hitOf(e.target);
    const anchor = anchorOf(st.elements, hit) ?? (hit ? null : (nearestAnchor(st.elements, st.live, point, tolerance())?.anchor ?? null));
    return { point, elementId: hit?.id ?? anchor?.elementId ?? null, anchor };
  }

  function startPinch() {
    const [a, b] = [...touches.current.values()];
    gesture.current = {
      kind: "pinch",
      distance: Math.hypot(a.x - b.x, a.y - b.y),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
      camera: store.state.camera,
    };
    store.setDrag(null);
    store.setOverlay(null);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    ref.current?.focus({ preventScroll: true });
    if (e.pointerType === "touch") {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size === 2) return startPinch();
      if (touches.current.size > 2) return;
    }
    const st = store.state;
    const p = toScene(e.clientX, e.clientY);
    const start = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);

    if (e.button === 1 || st.tool === "hand" || space.current || readOnly) {
      gesture.current = { kind: "pan", start, camera: st.camera };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;
    const hit = hitOf(e.target);
    /** Ctrl or Cmd: draw a line or arrow whose ends attach to nothing. */
    const mod = e.ctrlKey || e.metaKey;

    switch (st.tool) {
      case "select": {
        if (hit?.handle === "aim") {
          gesture.current = { kind: "aim", pointerId: hit.id };
          return;
        }
        // Resize handles on a selected shape, endpoint handles on a selected line (SelectionHandles).
        const handled = hit?.handle ? st.elements.get(hit.id) : undefined;
        if ((handled?.type === "shape" || handled?.type === "image") && hit!.handle!.startsWith("resize-")) {
          gesture.current = { kind: "resize", original: handled, handle: hit!.handle!.slice(7) as ResizeHandle, origin: p };
          return;
        }
        if (handled?.type === "line" && (hit!.handle === "line-start" || hit!.handle === "line-end")) {
          gesture.current = { kind: "endpoint", original: handled, end: hit!.handle === "line-start" ? "start" : "end", origin: p };
          return;
        }
        if (hit && st.elements.get(hit.id)) {
          const selection = new Set(st.selection);
          if (e.shiftKey) {
            if (selection.has(hit.id)) selection.delete(hit.id);
            else selection.add(hit.id);
          } else if (!selection.has(hit.id)) {
            selection.clear();
            selection.add(hit.id);
          }
          store.select(selection);
          if (hit.cell !== null) store.setActiveCell({ elementId: hit.id, index: hit.cell });
          if (!selection.has(hit.id)) return;
          const ids = new Set([...selection].filter((id) => st.elements.get(id)?.type !== "link"));
          gesture.current = { kind: "move", origin: p, start, clicked: hit.id, ids, moving: movedBy(st.elements, ids), moved: false, additive: e.shiftKey };
        } else {
          if (!e.shiftKey) store.select([]);
          gesture.current = { kind: "marquee", origin: p, base: e.shiftKey ? new Set(st.selection) : new Set() };
        }
        return;
      }
      case "pointer":
        gesture.current = { kind: "pointer", origin: p, start, clickAnchor: anchorOf(st.elements, hit), moved: false };
        return;
      case "link": {
        const el = hit && st.elements.get(hit.id);
        if (el?.type === "node") gesture.current = { kind: "link", fromId: el.id };
        return;
      }
      case "freehand": {
        const points: [number, number, number][] = [[p.x, p.y, e.pressure || 0.5]];
        gesture.current = { kind: "draw", points };
        store.setOverlay({ kind: "freehand", points });
        return;
      }
      case "note":
      case "text": {
        const el = createElement(
          st.tool === "note" ? { type: "note", x: snap(p.x), y: snap(p.y), text: "" } : { type: "text", x: snap(p.x), y: snap(p.y), text: "", size: "m" },
          keysAfter(store.lastKey, 1)[0],
        );
        store.commit([el], { select: [el.id] });
        store.setTool("select");
        store.setEditing({ kind: "text", elementId: el.id });
        return;
      }
      case "rectangle":
      case "rounded":
      case "diamond":
      case "ellipse":
      case "arrow":
      case "line":
        gesture.current = {
          kind: "shape",
          tool: st.tool,
          origin: { x: snap(p.x), y: snap(p.y) },
          start,
          id: randomId(),
          key: keysAfter(store.lastKey, 1)[0],
          moved: false,
          startBind: (st.tool === "arrow" || st.tool === "line") && !mod ? (bindTargetAt(st.live, p, bindMargin())?.id ?? null) : null,
          endBind: null,
        };
        return;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const g = gesture.current;
    const st = store.state;
    if (!g) {
      // The arrow and line tools show what one started here would attach to.
      if ((st.tool === "arrow" || st.tool === "line") && !readOnly && e.pointerType !== "touch") {
        showBindHint(e.ctrlKey || e.metaKey ? null : bindTargetAt(st.live, toScene(e.clientX, e.clientY), bindMargin()), true);
      }
      return;
    }
    const p = toScene(e.clientX, e.clientY);
    const far = (start: Point) => Math.hypot(e.clientX - start.x, e.clientY - start.y) >= DRAG_THRESHOLD;

    switch (g.kind) {
      case "pan":
        store.setCamera({ ...g.camera, x: g.camera.x + (e.clientX - g.start.x) / g.camera.zoom, y: g.camera.y + (e.clientY - g.start.y) / g.camera.zoom });
        return;
      case "pinch": {
        if (touches.current.size < 2) return;
        const [a, b] = [...touches.current.values()];
        const rect = ref.current!.getBoundingClientRect();
        const zoom = Math.min(3, Math.max(0.25, g.camera.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / g.distance)));
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        // The scene point under the starting midpoint follows the fingers' midpoint.
        const scene = { x: (g.mid.x - rect.left) / g.camera.zoom - g.camera.x, y: (g.mid.y - rect.top) / g.camera.zoom - g.camera.y };
        store.setCamera({ zoom, x: (mid.x - rect.left) / zoom - scene.x, y: (mid.y - rect.top) / zoom - scene.y });
        return;
      }
      case "move": {
        if (!g.moved && !far(g.start)) return;
        g.moved = true;
        store.setDrag({ ids: g.moving, dx: snap(p.x - g.origin.x), dy: snap(p.y - g.origin.y) });
        showDropShape(rebindTarget(g, p)?.shape ?? null);
        return;
      }
      case "marquee": {
        const rect = {
          x: Math.min(g.origin.x, p.x),
          y: Math.min(g.origin.y, p.y),
          w: Math.abs(p.x - g.origin.x),
          h: Math.abs(p.y - g.origin.y),
        };
        const inside = st.live.filter((el) => {
          const b = elementBounds(el);
          return b && b.x >= rect.x && b.y >= rect.y && b.x + b.w <= rect.x + rect.w && b.y + b.h <= rect.y + rect.h;
        });
        store.setOverlay({ kind: "marquee", rect });
        store.select([...g.base, ...inside.map((el) => el.id)]);
        return;
      }
      case "pointer": {
        if (!g.moved && !far(g.start)) return;
        g.moved = true;
        const found = nearestAnchor(st.elements, st.live, p, tolerance());
        store.setOverlay({ kind: "pointer", from: g.origin, to: found ? center(found.shape) : p, snap: found?.shape ?? null });
        return;
      }
      case "aim": {
        const found = nearestAnchor(st.elements, st.live, p, tolerance());
        store.setOverlay({ kind: "aim", pointerId: g.pointerId, to: found ? center(found.shape) : p, snap: found?.shape ?? null });
        return;
      }
      case "link": {
        const from = st.elements.get(g.fromId);
        const target = nodeAt(st.live, p, 4 / st.camera.zoom);
        const ok = target && from?.type === "node" && target.id !== from.id && target.variant === from.variant;
        store.setOverlay({ kind: "link", fromId: g.fromId, to: ok ? center(nodeShape(target)) : p, snapId: ok ? target.id : null });
        return;
      }
      case "draw": {
        const last = g.points[g.points.length - 1];
        if (Math.hypot(p.x - last[0], p.y - last[1]) < 1 / st.camera.zoom) return;
        g.points = [...g.points, [p.x, p.y, e.pressure || 0.5]];
        store.setOverlay({ kind: "freehand", points: g.points });
        return;
      }
      case "shape": {
        if (!g.moved && !far(g.start)) return;
        g.moved = true;
        if (g.tool === "arrow" || g.tool === "line") {
          const target = e.ctrlKey || e.metaKey ? null : bindTargetAt(st.live, p, bindMargin(), g.startBind);
          g.endBind = target?.id ?? null;
          showBindHint(target);
        }
        store.setPreview([drawnElement(store, g, p, e.shiftKey)]);
        return;
      }
      case "resize": {
        const el = g.original;
        // The handle follows the pointer from where it was grabbed, so the edge doesn't jump to the cursor.
        const from = handlePoint(el, g.handle);
        const q = { x: from.x + p.x - g.origin.x, y: from.y + p.y - g.origin.y };
        // A picture keeps its proportions unless Shift is held; a shape the other way round.
        const keepRatio = el.type === "image" ? !e.shiftKey : e.shiftKey;
        const r = resizeRect({ x: el.x, y: el.y, w: el.w, h: el.h }, g.handle, keepRatio ? q : { x: snap(q.x), y: snap(q.y) }, keepRatio);
        store.setPreview([{ ...el, ...r }]);
        return;
      }
      case "endpoint": {
        const el = g.original;
        const i = g.end === "start" ? 0 : el.points.length - 1;
        const other = el.points[g.end === "start" ? 1 : el.points.length - 2];
        const q = { x: el.x + el.points[i][0] + p.x - g.origin.x, y: el.y + el.points[i][1] + p.y - g.origin.y };
        const to = e.shiftKey ? snapAngle({ x: el.x + other[0], y: el.y + other[1] }, q) : { x: snap(q.x), y: snap(q.y) };
        const points = el.points.map((pt, k) => (k === i ? ([to.x - el.x, to.y - el.y] as [number, number]) : pt));
        // The end attaches to what it's dropped on (not with Ctrl or Cmd), and comes loose when dragged off it.
        const otherBinding = g.end === "start" ? el.endBinding : el.startBinding;
        const target = e.ctrlKey || e.metaKey ? null : bindTargetAt(st.live, p, bindMargin(), otherBinding?.elementId);
        const binding = target ? { elementId: target.id } : null;
        showBindHint(target);
        store.setPreview([resolveLine(st.elements, { ...el, points, ...(g.end === "start" ? { startBinding: binding } : { endBinding: binding }) })]);
        return;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    touches.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      // Lifting one finger of a pinch ends it; the other doesn't start a pan.
      if (touches.current.size < 2) gesture.current = null;
      return;
    }
    gesture.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    showBindHint(null);
    const st = store.state;
    const p = toScene(e.clientX, e.clientY);

    switch (g.kind) {
      case "move": {
        const drag = st.drag;
        store.setDrag(null);
        showDropShape(null);
        const rebind = g.moved && drag ? rebindTarget(g, p) : null;
        if (rebind && drag) {
          const { pointer, anchor } = rebind;
          const label = pointerLabelFor(st.elements, anchor, pointer.name, pointer.id) ?? { x: pointer.x + drag.dx, y: pointer.y + drag.dy };
          store.commit([withChanges(pointer, { target: anchor, end: undefined, ...label })]);
        } else if (g.moved && drag) store.commit(moveElements(st.elements, g.ids, drag.dx, drag.dy));
        // A click on one of several selected elements selects just that one.
        else if (!g.moved && !g.additive && st.selection.size > 1) store.select([g.clicked]);
        return;
      }
      case "marquee":
        store.setOverlay(null);
        return;
      case "pointer": {
        store.setOverlay(null);
        let pointer;
        if (!g.moved) {
          // A click on a cell or node puts a pointer on it.
          const label = g.clickAnchor && pointerLabelFor(st.elements, g.clickAnchor);
          if (!g.clickAnchor || !label) return;
          pointer = createPointer(st.elements, label, g.clickAnchor, p, store.lastKey);
        } else {
          const found = nearestAnchor(st.elements, st.live, p, tolerance());
          pointer = createPointer(st.elements, { x: g.origin.x - 12, y: g.origin.y - 11 }, found?.anchor ?? null, p, store.lastKey);
        }
        store.commit([pointer], { select: [pointer.id] });
        store.setTool("select");
        store.setEditing({ kind: "name", elementId: pointer.id });
        return;
      }
      case "aim": {
        store.setOverlay(null);
        const el = st.elements.get(g.pointerId);
        if (el?.type !== "pointer") return;
        const found = nearestAnchor(st.elements, st.live, p, tolerance());
        store.commit([found ? withChanges(el, { target: found.anchor, end: undefined }) : withChanges(el, { target: null, end: p })]);
        return;
      }
      case "link": {
        store.setOverlay(null);
        const from = st.elements.get(g.fromId);
        if (from?.type !== "node") return;
        const target = nodeAt(st.live, p, 4 / st.camera.zoom);
        const port = portToward(from, p);
        if (target && target.id !== from.id && target.variant === from.variant) {
          store.commit(connect(st.elements, from, port, target, store.lastKey));
        } else if (!target && from.variant !== "graph") {
          // Dropped on empty space: the link points at null.
          const c = center(nodeShape(from));
          if (Math.hypot(p.x - c.x, p.y - c.y) > 30) store.commit(connect(st.elements, from, port, null, store.lastKey));
        }
        return;
      }
      case "draw": {
        store.setOverlay(null);
        if (g.points.length < 2) return;
        const x = Math.min(...g.points.map((q) => q[0]));
        const y = Math.min(...g.points.map((q) => q[1]));
        const points = g.points.slice(0, 1500).map(([px, py, pr]) => [px - x, py - y, Math.min(1, Math.max(0, pr))] as [number, number, number]);
        store.commit([createElement({ type: "freehand", x, y, points, tone: "ink" }, keysAfter(store.lastKey, 1)[0])]);
        return;
      }
      case "shape": {
        store.setPreview(null);
        const el = drawnElement(store, g, g.moved ? p : null, e.shiftKey);
        // A line dragged back onto its start has no length; drop it.
        if (el.type === "line" && el.points[1][0] === el.points[0][0] && el.points[1][1] === el.points[0][1]) return;
        store.commit([el], { select: [el.id] });
        store.setTool("select");
        return;
      }
      case "resize":
      case "endpoint": {
        const shown = st.preview?.get(g.original.id);
        store.setPreview(null);
        const current = st.elements.get(g.original.id);
        if (!shown || !current || current.isDeleted) return;
        if (current.type === "shape" && shown.type === "shape") {
          // Narrowing a shape can make its text need more height.
          const h = fittedShapeHeight({ ...current, w: shown.w, h: shown.h });
          store.commit([withChanges(current, { x: shown.x, y: shown.y, w: shown.w, h })]);
        } else if (current.type === "image" && shown.type === "image") {
          store.commit([withChanges(current, { x: shown.x, y: shown.y, w: shown.w, h: shown.h })]);
        } else if (current.type === "line" && shown.type === "line") {
          const [x0, y0] = shown.points[0];
          if (shown.points.every(([x, y]) => x === x0 && y === y0)) return;
          store.commit([withChanges(current, { points: shown.points, startBinding: shown.startBinding, endBinding: shown.endBinding })]);
        }
        return;
      }
      case "pan":
        return;
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const st = store.state;
    // The canvas holds the pointer capture from the first click, so the event's target can be the canvas itself;
    // what's under the pointer is asked for directly.
    const hit = hitOf(document.elementFromPoint(e.clientX, e.clientY) ?? e.target);
    if (!hit) {
      if (st.tool !== "select") return;
      const p = toScene(e.clientX, e.clientY);
      // Text and notes only take clicks on their words, so a double-click in the box around them edits them
      // instead of starting a new one.
      const existing = [...st.live].reverse().find((el) => {
        if (el.type !== "text" && el.type !== "note") return false;
        const b = elementBounds(el);
        return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;
      });
      if (existing) {
        store.select([existing.id]);
        store.setEditing({ kind: "text", elementId: existing.id });
        return;
      }
      // Inside an empty shape (whose inside doesn't take clicks), write in the shape.
      const container = shapeAt(st.live, p);
      if (container) {
        store.select([container.id]);
        store.setEditing({ kind: "text", elementId: container.id });
        return;
      }
      const el = createElement({ type: "text", x: snap(p.x), y: snap(p.y), text: "", size: "m" }, keysAfter(store.lastKey, 1)[0]);
      store.commit([el], { select: [el.id] });
      store.setEditing({ kind: "text", elementId: el.id });
      return;
    }
    const el = st.elements.get(hit.id);
    if (!el) return;
    if (hit.cell !== null) store.setEditing({ kind: "cell", elementId: el.id, index: hit.cell });
    else if (hit.row !== null && hit.col !== null) store.setEditing({ kind: "matrixCell", elementId: el.id, row: hit.row, col: hit.col });
    else if (hit.entry !== null) store.setEditing({ kind: "entry", elementId: el.id, row: hit.entry, part: hit.part ?? 0 });
    else if (hit.label) store.setEditing({ kind: "label", elementId: el.id });
    else if (el.type === "node") store.setEditing({ kind: "value", elementId: el.id });
    else if (el.type === "note" || el.type === "text" || el.type === "shape") store.setEditing({ kind: "text", elementId: el.id });
    else if (el.type === "pointer") store.setEditing({ kind: "name", elementId: el.id });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (e.key === " ") {
      holdSpace(true);
      e.preventDefault();
      return;
    }
    // Zoom works everywhere, also read-only on a phone with a keyboard.
    if (key === "=" || key === "+") {
      e.preventDefault();
      return zoomAt(store, 1.2);
    }
    if (key === "-") {
      e.preventDefault();
      return zoomAt(store, 1 / 1.2);
    }
    if (mod && key === "0") {
      e.preventDefault();
      return resetZoom(store);
    }
    if (e.shiftKey && e.code === "Digit1") {
      e.preventDefault();
      return zoomToFit(store);
    }
    if (readOnly) return;

    const handled = () => e.preventDefault();
    if (mod && key === "z") {
      handled();
      return e.shiftKey ? store.redo() : store.undo();
    }
    if (mod && key === "y") return (handled(), store.redo());
    if (mod && key === "d") return (handled(), duplicateSelection(store));
    if (mod && key === "c") return copySelection(store);
    if (mod && key === "x") return cutSelection(store);
    if (mod && key === "v") return (handled(), paste(store));
    if (mod && key === "a") return (handled(), selectAll(store));
    if (mod && key === "s") return (handled(), void store.flush());
    if (mod && e.shiftKey && e.key === "]") return (handled(), arrange(store, "front"));
    if (mod && e.shiftKey && e.key === "[") return (handled(), arrange(store, "back"));
    if (mod) return;

    switch (e.key) {
      case "Delete":
      case "Backspace":
        return (handled(), deleteSelection(store));
      case "Escape":
        store.select([]);
        store.setTool("select");
        return;
      case "Enter":
        return (handled(), startEditing(store));
      case "Tab":
        return (handled(), cycleSelection(store, e.shiftKey));
      case "ArrowLeft":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowDown": {
        handled();
        const step = e.shiftKey ? 40 : 8;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        return nudge(store, dx, dy);
      }
    }
    if (!e.altKey && TOOL_KEYS[key]) store.setTool(TOOL_KEYS[key]);
  }

  /** Picture files dragged in from the desktop: they join the library and land where they were dropped. */
  const carriesFiles = (dt: DataTransfer) => dt.types.includes("Files");

  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    const { types } = e.dataTransfer;
    if (!readOnly && (types.includes(LIBRARY_IMAGE_MIME) || carriesFiles(e.dataTransfer))) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      return;
    }
    if (readOnly || (!types.includes(PALETTE_MIME) && !types.includes(PALETTE_PART_MIME))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    // The drag's data can't be read until the drop, so the palette says which part is on its way.
    const part = draggedPart();
    const target = part && partDropTarget(store.state.elements, part, partDropOf(e));
    showDropShape(target ? dropTargetShape(store.state.elements, target) : null);
  }

  /** A part dropped on a node, cell or entry attaches there; on empty canvas it's placed where it was dropped. */
  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    showDropShape(null);
    if (readOnly) return;
    const at = toScene(e.clientX, e.clientY);
    const imageId = e.dataTransfer.getData(LIBRARY_IMAGE_MIME);
    if (imageId) {
      e.preventDefault();
      const image = libraryImage(imageId);
      if (image) placeImage(store, image, at);
      ref.current?.focus({ preventScroll: true });
      return;
    }
    const files = [...e.dataTransfer.files].filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      void uploadImages(files).then((added) => added.forEach((image, i) => placeImage(store, image, { x: at.x + i * 24, y: at.y + i * 24 })));
      ref.current?.focus({ preventScroll: true });
      return;
    }
    const part = partById(e.dataTransfer.getData(PALETTE_PART_MIME));
    if (part) {
      e.preventDefault();
      setDraggedPart(null);
      ref.current?.focus({ preventScroll: true });
      runPart(store, part, partDropOf(e));
      return;
    }
    const kind = e.dataTransfer.getData(PALETTE_MIME) as PaletteKind;
    if (!(PALETTE_KINDS as readonly string[]).includes(kind)) return;
    e.preventDefault();
    insertElements(store, template(kind), toScene(e.clientX, e.clientY));
  }

  const { camera, drag, preview } = s;
  let shown: ElementMap = drag
    ? new Map([...s.elements].map(([id, el]) => [id, drag.ids.has(id) ? shifted(el, drag.dx, drag.dy) : el]))
    : s.elements;
  let live = drag ? s.live.map((el) => shown.get(el.id)!) : s.live;
  // An unfinished draw, resize or style change: drawn in place of the stored copy, or on top when new.
  if (preview) {
    shown = new Map([...shown, ...preview]);
    live = [...live.map((el) => preview.get(el.id) ?? el), ...[...preview.values()].filter((el) => !s.elements.has(el.id))];
  }
  // Arrows attached to what's being dragged or resized follow it; one dragged without its elements comes loose.
  if (drag || preview) {
    const followed = new Map<string, SketchElement>();
    for (const el of live) {
      if (el.type !== "line" || (!el.startBinding && !el.endBinding)) continue;
      const line = resolveLine(shown, drag?.ids.has(el.id) ? looseOutside(el, drag.ids) : el);
      if (line !== el) followed.set(el.id, line);
    }
    if (followed.size) {
      shown = new Map([...shown, ...followed]);
      live = live.map((el) => followed.get(el.id) ?? el);
    }
  }
  const editingEl = s.editing && shown.get(s.editing.elementId);
  const selected = live.filter((el) => s.selection.has(el.id));
  const announcement = selected.length === 1 ? describeElement(shown, selected[0]) : selected.length > 1 ? `${selected.length} elements selected` : "";

  return (
    <div
      ref={ref}
      tabIndex={0}
      role="application"
      aria-label="Sketch canvas"
      aria-roledescription="canvas"
      aria-describedby="sketch-canvas-help"
      className={cn(
        sketchFonts,
        "relative h-full w-full touch-none overflow-hidden bg-paper outline-none select-none",
        s.grid && "bg-graph-subtle",
        readOnly ? "cursor-grab" : CURSOR[s.tool],
        // An open hand while Space is held, a closed one while dragging; it also covers elements' own cursors.
        (spaceHeld || panning) && "cursor-grab **:cursor-grab!",
        panning && "cursor-grabbing **:cursor-grabbing!",
      )}
      style={{
        backgroundSize: `${32 * camera.zoom}px ${32 * camera.zoom}px`,
        backgroundPosition: `${camera.x * camera.zoom}px ${camera.y * camera.zoom}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onKeyDown={onKeyDown}
      onKeyUp={(e) => {
        if (e.key === " ") holdSpace(false);
      }}
      onBlur={() => holdSpace(false)}
      onPointerLeave={() => {
        if (!gesture.current) showBindHint(null);
      }}
      onDragOver={onDragOver}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) showDropShape(null);
      }}
      onDrop={onDrop}
    >
      <div
        data-sketch-scene
        className={cn(sketchFonts, "absolute top-0 left-0 origin-top-left")}
        style={{ transform: `scale(${camera.zoom}) translate(${camera.x}px, ${camera.y}px)` }}
      >
        {live.map((el) => (
          <ElementView
            key={el.id}
            el={el}
            activeCell={s.activeCell}
            selected={s.selection.has(el.id)}
            editingText={s.editing?.kind === "text" && s.editing.elementId === el.id}
          />
        ))}
        <Connectors elements={shown} live={live} selection={s.selection} overlay={s.overlay} />
        {live.map((el) =>
          el.type === "pointer" ? (
            <PointerLabel key={el.id} el={el} outOfRange={Boolean(el.target && isOutOfRange(shown, el.target))} />
          ) : null,
        )}
        {selected.map((el) => {
          const b = el.type === "pointer" ? pointerLabelRect(el) : elementBounds(el);
          // A selected line shows a halo along itself (LineView) instead of a box.
          if (!b || el.type === "line") return null;
          // Plain text being typed draws its own outline, which grows with the words.
          if (el.type === "text" && s.editing?.kind === "text" && s.editing.elementId === el.id) return null;
          return (
            <div
              key={`sel-${el.id}`}
              data-export-skip
              className="pointer-events-none absolute rounded-md border-2 border-brand"
              style={{ left: b.x - 4, top: b.y - 4, width: b.w + 8, height: b.h + 8 }}
            />
          );
        })}
        {!readOnly && !drag && !s.editing && selected.length === 1 && <SelectionHandles el={selected[0]} zoom={camera.zoom} />}
        {s.overlay?.kind === "marquee" && (
          <div
            data-export-skip
            className="pointer-events-none absolute rounded-sm border border-brand bg-brand/10"
            style={{ left: s.overlay.rect.x, top: s.overlay.rect.y, width: s.overlay.rect.w, height: s.overlay.rect.h }}
          />
        )}
        {dropShape && (
          <div
            data-export-skip
            className={cn("pointer-events-none absolute z-10 border-2 border-brand bg-brand/15", dropShape.kind === "circle" ? "rounded-full" : "rounded-md")}
            style={
              dropShape.kind === "circle"
                ? { left: dropShape.cx - dropShape.r - 3, top: dropShape.cy - dropShape.r - 3, width: dropShape.r * 2 + 6, height: dropShape.r * 2 + 6 }
                : { left: dropShape.rect.x - 3, top: dropShape.rect.y - 3, width: dropShape.rect.w + 6, height: dropShape.rect.h + 6 }
            }
          />
        )}
        {bindHint && (!bindHint.hover || s.tool === "arrow" || s.tool === "line") && <BindHint outline={bindHint.outline} />}
        {s.editing && editingEl && !readOnly && (
          <InlineEditor key={JSON.stringify(s.editing)} store={store} target={s.editing} element={editingEl} />
        )}
      </div>

      {!readOnly && !drag && !s.editing && selected.length === 1 && <ElementToolbar store={store} element={selected[0]} />}
      {!readOnly && <StylePanel store={store} />}

      <p id="sketch-canvas-help" className="sr-only">
        Tab moves between elements, Enter edits the selected one, arrow keys move it, Delete removes it. V selects, H pans, P adds a
        pointer, L links nodes, D draws, N adds a note, T adds text. R draws a rectangle, U a rounded rectangle, 3 a diamond, O an
        ellipse, A an arrow, I a line; Enter on a shape writes in it. An arrow or line drawn from one element to another stays
        attached to both; hold Control to leave its ends free. Changes save every 30 seconds and when you leave; Control S saves now.
      </p>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
