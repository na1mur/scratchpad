import { createElement, randomId, withChanges } from "./elements";
import { anchorShape, center, elementBounds, nodeSize, type ElementMap, type Point } from "./layout";
import { keysAfter, keysBefore, sortByOrder } from "./order";
import { instantiate } from "./templates";
import {
  MAX_CELLS,
  MAX_ENTRIES,
  MAX_MATRIX,
  type Anchor,
  type CellsElement,
  type ElementOf,
  type LinkPort,
  type SketchElement,
  type TableElement,
} from "./types";

/**
 * Edits as pure functions: each takes the current elements and returns the elements it changed (new versions,
 * or new elements). The store writes them and records one undo entry per call, as Excalidraw's actions do.
 */

export type Changes = SketchElement[];

const liveList = (elements: ElementMap) => [...elements.values()].filter((el) => !el.isDeleted);

/** Removes elements, the links into or out of removed nodes, and leaves pointers to them aimed at empty space. */
export function deleteElements(elements: ElementMap, ids: ReadonlySet<string>): Changes {
  const out: Changes = [];
  for (const el of liveList(elements)) {
    if (ids.has(el.id)) {
      out.push(withChanges(el, { isDeleted: true }));
    } else if (el.type === "link" && (ids.has(el.from.elementId) || (el.to && ids.has(el.to.elementId)))) {
      out.push(withChanges(el, { isDeleted: true }));
    } else if (el.type === "pointer" && el.target && ids.has(el.target.elementId)) {
      out.push(unbind(elements, el));
    }
  }
  return out;
}

function unbind(elements: ElementMap, el: ElementOf<"pointer">): ElementOf<"pointer"> {
  const shape = el.target && anchorShape(elements, el.target);
  return withChanges(el, { target: null, end: shape ? center(shape) : { x: el.x, y: el.y - 40 } });
}

/** Moves elements, and the pointers aimed at them so a pointer travels with its array. */
export function moveElements(elements: ElementMap, ids: ReadonlySet<string>, dx: number, dy: number): Changes {
  if (!dx && !dy) return [];
  const out: Changes = [];
  for (const el of liveList(elements)) {
    if (el.type === "link") continue;
    const follows = el.type === "pointer" && el.target && ids.has(el.target.elementId);
    if (!ids.has(el.id) && !follows) continue;
    if (el.type === "pointer" && el.end) out.push(withChanges(el, { x: el.x + dx, y: el.y + dy, end: { x: el.end.x + dx, y: el.end.y + dy } }));
    else out.push(withChanges(el, { x: el.x + dx, y: el.y + dy }));
  }
  return out;
}

/** The ids a drag of `ids` moves (pointers follow their targets), for the live preview. */
export function movedBy(elements: ElementMap, ids: ReadonlySet<string>): Set<string> {
  const out = new Set(ids);
  for (const el of liveList(elements)) {
    if (el.type === "pointer" && el.target && ids.has(el.target.elementId)) out.add(el.id);
  }
  return out;
}

/**
 * Copies of the elements, offset a little, with the links among them (and links to null). Pointers come along
 * only when selected; a copied pointer aimed outside the copy keeps its target.
 */
export function duplicateElements(elements: ElementMap, ids: ReadonlySet<string>, lastKey: string | null, offset: Point = { x: 24, y: 24 }): Changes {
  const picked = sortByOrder(
    liveList(elements).filter((el) =>
      el.type === "link" ? ids.has(el.from.elementId) && (!el.to || ids.has(el.to.elementId)) : ids.has(el.id),
    ),
  );
  return instantiate(picked, offset, lastKey);
}

export function bringToFront(elements: ElementMap, ids: ReadonlySet<string>, lastKey: string | null): Changes {
  const picked = sortByOrder(liveList(elements).filter((el) => ids.has(el.id)));
  const keys = keysAfter(lastKey, picked.length);
  return picked.map((el, i) => withChanges(el, { index: keys[i] }));
}

export function sendToBack(elements: ElementMap, ids: ReadonlySet<string>, firstKey: string | null): Changes {
  const picked = sortByOrder(liveList(elements).filter((el) => ids.has(el.id)));
  const keys = keysBefore(firstKey, picked.length);
  return picked.map((el, i) => withChanges(el, { index: keys[i] }));
}

// Cells

/** Inserts a cell before `at` (the end when at ≥ length). Pointers keep their index, as index variables do. */
export function insertCell(el: CellsElement, at: number, value = ""): Changes {
  if (el.values.length >= MAX_CELLS) return [];
  const i = Math.max(0, Math.min(at, el.values.length));
  return [
    withChanges(el, {
      values: [...el.values.slice(0, i), value, ...el.values.slice(i)],
      cellIds: [...el.cellIds.slice(0, i), randomId(), ...el.cellIds.slice(i)],
    } as Partial<CellsElement>),
  ];
}

export function removeCell(el: CellsElement, at: number): Changes {
  if (!el.values.length) return [];
  const i = Math.max(0, Math.min(at, el.values.length - 1));
  return [
    withChanges(el, {
      values: el.values.filter((_, k) => k !== i),
      cellIds: el.cellIds.filter((_, k) => k !== i),
    } as Partial<CellsElement>),
  ];
}

export function setCell(el: CellsElement, at: number, value: string): Changes {
  if (at < 0 || at >= el.values.length || el.values[at] === value) return [];
  return [withChanges(el, { values: el.values.map((v, k) => (k === at ? value : v)) } as Partial<CellsElement>)];
}

// Tables

export function addEntry(el: TableElement): Changes {
  if (el.entries.length >= MAX_ENTRIES) return [];
  const taken = new Set(el.entries.map(([k]) => k));
  let key = "";
  for (let n = 1; taken.has(key); n++) key = `k${n}`;
  return [withChanges(el, { entries: [...el.entries, [key, ""]] } as Partial<TableElement>)];
}

export function removeEntry(elements: ElementMap, el: TableElement, at: number): Changes {
  const key = el.entries[at]?.[0];
  if (key === undefined) return [];
  const out: Changes = [withChanges(el, { entries: el.entries.filter((_, k) => k !== at) } as Partial<TableElement>)];
  const next = new Map(elements).set(el.id, out[0]);
  for (const p of liveList(elements)) {
    if (p.type === "pointer" && p.target?.kind === "entry" && p.target.elementId === el.id && p.target.key === key) {
      out.push(unbind(next, p));
    }
  }
  return out;
}

/** Sets a key or a value. Renaming a key carries the pointers aimed at it to the new name. */
export function setEntry(elements: ElementMap, el: TableElement, at: number, part: 0 | 1, value: string): Changes {
  const entry = el.entries[at];
  if (!entry || entry[part] === value) return [];
  // Keys stay unique: a pointer can only name one of them.
  if (part === 0 && el.entries.some(([k], i) => i !== at && k === value)) return [];
  const entries = el.entries.map((e, i) => (i === at ? ((part === 0 ? [value, e[1]] : [e[0], value]) as [string, string]) : e));
  const out: Changes = [withChanges(el, { entries } as Partial<TableElement>)];
  if (part === 0) {
    for (const p of liveList(elements)) {
      if (p.type === "pointer" && p.target?.kind === "entry" && p.target.elementId === el.id && p.target.key === entry[0]) {
        out.push(withChanges(p, { target: { ...p.target, key: value } }));
      }
    }
  }
  return out;
}

// Matrix

export function resizeMatrix(el: ElementOf<"matrix">, rows: number, cols: number): Changes {
  const r = Math.max(1, Math.min(MAX_MATRIX, rows));
  const c = Math.max(1, Math.min(MAX_MATRIX, cols));
  const next = Array.from({ length: r }, (_, i) => Array.from({ length: c }, (_, j) => el.rows[i]?.[j] ?? ""));
  return [withChanges(el, { rows: next })];
}

export function setMatrixCell(el: ElementOf<"matrix">, row: number, col: number, value: string): Changes {
  if (el.rows[row]?.[col] === undefined || el.rows[row][col] === value) return [];
  return [withChanges(el, { rows: el.rows.map((r, i) => (i === row ? r.map((v, j) => (j === col ? value : v)) : r)) })];
}

// Nodes and links

const linkAt = (elements: ElementMap, nodeId: string, port: LinkPort) =>
  liveList(elements).find((el): el is ElementOf<"link"> => el.type === "link" && el.from.elementId === nodeId && el.from.port === port);

/**
 * Links `from` to `to` (null: to null) on `port`. A list or tree node has one link per port, so an existing one
 * is replaced; a graph edge that already exists isn't added twice.
 */
export function connect(elements: ElementMap, from: ElementOf<"node">, port: LinkPort, to: ElementOf<"node"> | null, lastKey: string | null): Changes {
  if (to && to.id === from.id) return [];
  const out: Changes = [];
  if (port === "edge") {
    if (!to) return [];
    const exists = liveList(elements).some(
      (el) => el.type === "link" && el.from.elementId === from.id && el.to?.elementId === to.id,
    );
    if (exists) return [];
  } else {
    const existing = linkAt(elements, from.id, port);
    if (existing) {
      if (existing.to?.elementId === (to?.id ?? undefined) && (existing.to === null) === (to === null)) return [];
      out.push(withChanges(existing, { isDeleted: true }));
    }
  }
  out.push(createElement({ type: "link", x: 0, y: 0, from: { elementId: from.id, port }, to: to && { elementId: to.id } }, keysAfter(lastKey, 1)[0]));
  return out;
}

/** The port a link from `from` uses when dropped at `p`: a tree child goes left or right of its parent. */
export function portToward(from: ElementOf<"node">, p: Point): LinkPort {
  if (from.variant === "list") return "next";
  if (from.variant === "graph") return "edge";
  const { w } = nodeSize(from);
  return p.x < from.x + w / 2 ? "left" : "right";
}

/** A new list node after this one, spliced in before whatever this one pointed at. */
export function addNextNode(elements: ElementMap, node: ElementOf<"node">, lastKey: string | null): { changes: Changes; created: string } {
  const [nodeKey, linkKey, nextLinkKey] = keysAfter(lastKey, 3);
  const { w } = nodeSize(node);
  const created = createElement({ type: "node", x: node.x + w + 40, y: node.y, variant: "list", value: "" }, nodeKey) as ElementOf<"node">;
  const changes: Changes = [created];
  const existing = linkAt(elements, node.id, "next");
  if (existing) changes.push(withChanges(existing, { isDeleted: true }));
  changes.push(createElement({ type: "link", x: 0, y: 0, from: { elementId: node.id, port: "next" }, to: { elementId: created.id } }, linkKey));
  if (existing) {
    changes.push(createElement({ type: "link", x: 0, y: 0, from: { elementId: created.id, port: "next" }, to: existing.to }, nextLinkKey));
  }
  return { changes, created: created.id };
}

/** A new child on an empty side of a tree node, or a new neighbour of a graph node. */
export function addChild(elements: ElementMap, node: ElementOf<"node">, side: "left" | "right" | "edge", lastKey: string | null): { changes: Changes; created: string } | null {
  if (side !== "edge" && linkAt(elements, node.id, side)?.to) return null;
  const [nodeKey, linkKey] = keysAfter(lastKey, 2);
  const { w } = nodeSize(node);
  const at =
    side === "edge" ? { x: node.x + w + 56, y: node.y } : { x: node.x + (side === "left" ? -56 : 56), y: node.y + 72 };
  const created = createElement({ type: "node", ...at, variant: node.variant, value: "" }, nodeKey) as ElementOf<"node">;
  const changes: Changes = [created];
  const nullLink = side === "edge" ? undefined : linkAt(elements, node.id, side);
  if (nullLink) changes.push(withChanges(nullLink, { isDeleted: true }));
  changes.push(createElement({ type: "link", x: 0, y: 0, from: { elementId: node.id, port: side }, to: { elementId: created.id } }, linkKey));
  return { changes, created: created.id };
}

// Pointers

const CELL_NAMES = ["i", "j", "k", "left", "right", "lo", "mid", "hi", "start", "end"];
const NODE_NAMES = ["head", "curr", "prev", "next", "slow", "fast", "node", "tail"];
const KEY_NAMES = ["key", "k", "best"];

/** The first conventional name not yet used by a pointer. */
export function pointerName(elements: ElementMap, anchor: Anchor | null): string {
  const used = new Set(liveList(elements).flatMap((el) => (el.type === "pointer" ? [el.name] : [])));
  const names = anchor?.kind === "node" ? NODE_NAMES : anchor?.kind === "entry" ? KEY_NAMES : CELL_NAMES;
  return names.find((n) => !used.has(n)) ?? `p${used.size + 1}`;
}

export function createPointer(
  elements: ElementMap,
  label: Point,
  target: Anchor | null,
  end: Point,
  lastKey: string | null,
): ElementOf<"pointer"> {
  const name = pointerName(elements, target);
  return createElement(
    { type: "pointer", x: label.x, y: label.y, name, target, ...(target ? {} : { end }) },
    keysAfter(lastKey, 1)[0],
  ) as ElementOf<"pointer">;
}

/** Where a new pointer's name goes: under a cell or entry, above a node. */
export function pointerLabelFor(elements: ElementMap, target: Anchor): Point | null {
  const shape = anchorShape(elements, target);
  if (!shape) return null;
  const c = center(shape);
  const el = elements.get(target.elementId);
  const box = el && elementBounds(el);
  if (target.kind === "node") return { x: c.x - 12, y: (box?.y ?? c.y) - 44 };
  if (target.kind === "entry" && box) return { x: box.x + box.w + 24, y: c.y - 11 };
  // A stack grows upward, so its pointers sit to its left.
  if (el?.type === "stack" && box) return { x: box.x - 72, y: c.y - 11 };
  return { x: c.x - 12, y: (box ? box.y + box.h : c.y) + 28 };
}
