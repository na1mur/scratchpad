"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { connect, createPointer, movedBy, moveElements, pointerLabelFor, portToward } from "@/lib/sketch/actions";
import { describeElement } from "@/lib/sketch/describe";
import { createElement, withChanges } from "@/lib/sketch/elements";
import {
  center,
  elementBounds,
  isOutOfRange,
  nearestAnchor,
  nodeAt,
  nodeShape,
  pointerLabelRect,
  snap,
  type ElementMap,
  type Point,
} from "@/lib/sketch/layout";
import { keysAfter } from "@/lib/sketch/order";
import { PALETTE_KINDS, template, type PaletteKind } from "@/lib/sketch/templates";
import type { Anchor, SketchElement } from "@/lib/sketch/types";
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
import { ElementView, PointerLabel } from "./elements";
import { ElementToolbar } from "./ElementToolbar";
import { useSketch, type Camera, type SketchStore, type Tool } from "./store";

/** The drag type the palette uses, so the canvas only accepts its own items. */
export const PALETTE_MIME = "application/x-scratchpad-sketch";

const DRAG_THRESHOLD = 3;
/** How close, in screen pixels, a pointer or link has to be dropped to snap to its target. */
const SNAP_PX = 24;

type Gesture =
  | { kind: "pan"; start: Point; camera: Camera }
  | { kind: "pinch"; distance: number; mid: Point; camera: Camera }
  | { kind: "move"; origin: Point; start: Point; clicked: string; ids: Set<string>; moving: Set<string>; moved: boolean; additive: boolean }
  | { kind: "marquee"; origin: Point; base: Set<string> }
  | { kind: "pointer"; origin: Point; start: Point; clickAnchor: Anchor | null; moved: boolean }
  | { kind: "aim"; pointerId: string }
  | { kind: "link"; fromId: string }
  | { kind: "draw"; points: [number, number, number][] };

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

const TOOL_KEYS: Record<string, Tool> = { v: "select", h: "hand", p: "pointer", l: "link", d: "freehand", n: "note", t: "text" };

const CURSOR: Record<Tool, string> = {
  select: "cursor-default",
  hand: "cursor-grab",
  pointer: "cursor-crosshair",
  link: "cursor-crosshair",
  freehand: "cursor-crosshair",
  note: "cursor-copy",
  text: "cursor-text",
};

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
  const touches = useRef(new Map<number, Point>());

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
      return;
    }
    if (e.button !== 0) return;
    const hit = hitOf(e.target);

    switch (st.tool) {
      case "select": {
        if (hit?.handle === "aim") {
          gesture.current = { kind: "aim", pointerId: hit.id };
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
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) {
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const g = gesture.current;
    if (!g) return;
    const st = store.state;
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
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!g) return;
    const st = store.state;
    const p = toScene(e.clientX, e.clientY);

    switch (g.kind) {
      case "move": {
        const drag = st.drag;
        store.setDrag(null);
        if (g.moved && drag) store.commit(moveElements(st.elements, g.ids, drag.dx, drag.dy));
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
      case "pan":
        return;
    }
  }

  function onDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (readOnly) return;
    const st = store.state;
    const hit = hitOf(e.target);
    if (!hit) {
      if (st.tool !== "select") return;
      const p = toScene(e.clientX, e.clientY);
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
    else if (el.type === "note" || el.type === "text") store.setEditing({ kind: "text", elementId: el.id });
    else if (el.type === "pointer") store.setEditing({ kind: "name", elementId: el.id });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();
    if (e.key === " ") {
      space.current = true;
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

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    const kind = e.dataTransfer.getData(PALETTE_MIME) as PaletteKind;
    if (readOnly || !(PALETTE_KINDS as readonly string[]).includes(kind)) return;
    e.preventDefault();
    insertElements(store, template(kind), toScene(e.clientX, e.clientY));
  }

  const { camera, drag } = s;
  const shown: ElementMap = drag
    ? new Map([...s.elements].map(([id, el]) => [id, drag.ids.has(id) ? shifted(el, drag.dx, drag.dy) : el]))
    : s.elements;
  const live = drag ? s.live.map((el) => shown.get(el.id)!) : s.live;
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
        "relative h-full w-full touch-none overflow-hidden bg-paper bg-graph outline-none select-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset",
        readOnly ? "cursor-grab" : CURSOR[s.tool],
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
        if (e.key === " ") space.current = false;
      }}
      onBlur={() => {
        space.current = false;
      }}
      onDragOver={(e) => {
        if (!readOnly && e.dataTransfer.types.includes(PALETTE_MIME)) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }
      }}
      onDrop={onDrop}
    >
      <div
        className="absolute top-0 left-0 origin-top-left"
        style={{ transform: `scale(${camera.zoom}) translate(${camera.x}px, ${camera.y}px)` }}
      >
        {live.map((el) => (
          <ElementView key={el.id} el={el} activeCell={s.activeCell} />
        ))}
        <Connectors elements={shown} live={live} selection={s.selection} overlay={s.overlay} />
        {live.map((el) =>
          el.type === "pointer" ? (
            <PointerLabel key={el.id} el={el} outOfRange={Boolean(el.target && isOutOfRange(shown, el.target))} />
          ) : null,
        )}
        {selected.map((el) => {
          const b = el.type === "pointer" ? pointerLabelRect(el) : elementBounds(el);
          if (!b) return null;
          return (
            <div
              key={`sel-${el.id}`}
              className="pointer-events-none absolute rounded-md border-2 border-brand"
              style={{ left: b.x - 4, top: b.y - 4, width: b.w + 8, height: b.h + 8 }}
            />
          );
        })}
        {s.overlay?.kind === "marquee" && (
          <div
            className="pointer-events-none absolute rounded-sm border border-brand bg-brand/10"
            style={{ left: s.overlay.rect.x, top: s.overlay.rect.y, width: s.overlay.rect.w, height: s.overlay.rect.h }}
          />
        )}
        {s.editing && editingEl && !readOnly && (
          <InlineEditor key={JSON.stringify(s.editing)} store={store} target={s.editing} element={editingEl} />
        )}
      </div>

      {!readOnly && !drag && !s.editing && selected.length === 1 && <ElementToolbar store={store} element={selected[0]} />}

      <p id="sketch-canvas-help" className="sr-only">
        Tab moves between elements, Enter edits the selected one, arrow keys move it, Delete removes it. V selects, H pans, P adds a
        pointer, L links nodes, D draws, N adds a note, T adds text.
      </p>
      <div className="sr-only" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
