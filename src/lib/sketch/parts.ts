import {
  addChild,
  addEntry,
  addNextNode,
  connect,
  createPointer,
  insertCell,
  pointerLabelFor,
  removeCell,
  resizeMatrix,
  type Changes,
} from "./actions";
import { withChanges } from "./elements";
import { CELL_TYPES, MAX_MATRIX, isCells, type Anchor, type CellsElement, type ElementOf, type NewElement, type NodeVariant, type SketchElement } from "./types";
import { anchorShape, elementBounds, nodeShape, type ElementMap, type Point, type Shape } from "./layout";
import { PALETTE_LABELS, template, type PaletteKind } from "./templates";

/**
 * Parts: the pieces of each palette item that can be added on their own (a node, `head`, a pushed value, a left
 * child). `applyPart()` decides where a part goes, in this order: the element it was dropped on; else what's
 * selected (one fitting element, or several nodes of one structure); else the only fitting structure on the
 * canvas; else a free-standing copy at the drop point or the middle of the view. Parts that only make sense on
 * something (push, a left child) are refused with a reason instead. Safe to import on the client.
 */

export type PartIcon =
  | "whole"
  | "listNode"
  | "treeNode"
  | "leftChild"
  | "rightChild"
  | "null"
  | "link"
  | "cell"
  | "push"
  | "pop"
  | "entry"
  | "row"
  | "column";

type CellsType = CellsElement["type"];
type TableType = "hashmap" | "variables";

/** Which index a cell pointer takes when it isn't dropped on one and no cell is active. */
type CellRole = "start" | "second" | "middle" | "end";

type PointerOn =
  | { family: "list"; role: "first" | "second" | "last" }
  | { family: "tree" }
  | { family: "graph" }
  | { family: "cells"; types: readonly CellsType[]; variant?: "array" | "string"; role: CellRole }
  | { family: "matrix" };

export type PartEffect =
  | { kind: "whole"; make: () => NewElement[] }
  | { kind: "node"; variant: NodeVariant }
  | { kind: "child"; side: "left" | "right" }
  | { kind: "null"; variant: "list" | "tree" }
  | { kind: "link"; variant: "list" | "graph" }
  | { kind: "pointer"; name: string; on: PointerOn }
  | { kind: "cells"; types: readonly CellsType[]; variant?: "array" | "string"; op: "insert" | "push" | "pop" | "dequeue"; noun: string }
  | { kind: "entry"; type: TableType; noun: string }
  | { kind: "grow"; along: "row" | "column" };

export type Part = { id: string; label: string; hint: string; icon: PartIcon; effect: PartEffect };
export type PartGroup = { kind: PaletteKind; label: string; hint: string; parts: Part[] };

export const isPointerPart = (part: Part) => part.effect.kind === "pointer";

const whole = (kind: PaletteKind, label: string, hint: string, make: () => NewElement[] = () => template(kind)): Part => ({
  id: `${kind}.whole`,
  label,
  hint,
  icon: "whole",
  effect: { kind: "whole", make },
});

const pointer = (group: PaletteKind, name: string, hint: string, on: PointerOn): Part => ({
  id: `${group}.ptr.${name}`,
  label: name,
  hint,
  icon: "whole",
  effect: { kind: "pointer", name, on },
});

const ARRAY_ONLY = ["array"] as const;

function cellPointers(group: PaletteKind, variant: "array" | "string", names: [string, CellRole, string][]): Part[] {
  return names.map(([name, role, hint]) => pointer(group, name, hint, { family: "cells", types: ARRAY_ONLY, variant, role }));
}

function graphTemplate(): NewElement[] {
  return [
    { id: "a", type: "node", x: 48, y: 0, variant: "graph", value: "1" },
    { id: "b", type: "node", x: 0, y: 80, variant: "graph", value: "2" },
    { id: "c", type: "node", x: 104, y: 80, variant: "graph", value: "3" },
    { type: "link", x: 0, y: 0, from: { elementId: "a", port: "edge" }, to: { elementId: "b" } },
    { type: "link", x: 0, y: 0, from: { elementId: "a", port: "edge" }, to: { elementId: "c" } },
    { type: "link", x: 0, y: 0, from: { elementId: "b", port: "edge" }, to: { elementId: "c" } },
  ];
}

const group = (kind: PaletteKind, parts: Part[], label = PALETTE_LABELS[kind].label): PartGroup => ({
  kind,
  label,
  hint: PALETTE_LABELS[kind].hint,
  parts,
});

/** The palette's items, each with its parts. List and tree nodes are parts here rather than items of their own. */
export const PART_GROUPS: readonly PartGroup[] = [
  group("array", [
    whole("array", "Whole array", "Four empty cells"),
    { id: "array.cell", label: "Cell", hint: "Inserts a cell before the selected cell, or at the end", icon: "cell", effect: { kind: "cells", types: ARRAY_ONLY, variant: "array", op: "insert", noun: "an array" } },
    ...cellPointers("array", "array", [
      ["i", "start", "Index i, on the selected cell or the first"],
      ["j", "second", "Index j, on the selected cell or the second"],
      ["left", "start", "Left end of a window or two pointers"],
      ["right", "end", "Right end of a window or two pointers"],
      ["lo", "start", "Low end of a binary search"],
      ["mid", "middle", "Middle of a binary search"],
      ["hi", "end", "High end of a binary search"],
    ]),
  ]),
  group("string", [
    whole("string", "Whole string", "Characters in cells"),
    { id: "string.cell", label: "Character", hint: "Inserts a character before the selected one, or at the end", icon: "cell", effect: { kind: "cells", types: ARRAY_ONLY, variant: "string", op: "insert", noun: "a string" } },
    ...cellPointers("string", "string", [
      ["i", "start", "Index i, on the selected character or the first"],
      ["j", "second", "Index j, on the selected character or the second"],
      ["left", "start", "Left end of a window or two pointers"],
      ["right", "end", "Right end of a window or two pointers"],
    ]),
  ]),
  group("matrix", [
    whole("matrix", "Whole grid", "Three rows of three cells"),
    { id: "matrix.row", label: "Row", hint: "Adds a row at the bottom", icon: "row", effect: { kind: "grow", along: "row" } },
    { id: "matrix.col", label: "Column", hint: "Adds a column on the right", icon: "column", effect: { kind: "grow", along: "column" } },
    pointer("matrix", "(r,c)", "A cell position, on the cell it's dropped on or the first", { family: "matrix" }),
  ]),
  group("hashmap", [
    whole("hashmap", "Whole map", "One empty entry"),
    { id: "hashmap.entry", label: "Entry", hint: "Adds a key and value", icon: "entry", effect: { kind: "entry", type: "hashmap", noun: "a hash map" } },
  ]),
  group("set", [
    whole("set", "Whole set", "An empty set"),
    { id: "set.value", label: "Value", hint: "Adds a value", icon: "cell", effect: { kind: "cells", types: ["set"], op: "push", noun: "a set" } },
  ]),
  group("stack", [
    whole("stack", "Whole stack", "An empty stack"),
    { id: "stack.push", label: "Push", hint: "Pushes a value on top", icon: "push", effect: { kind: "cells", types: ["stack"], op: "push", noun: "a stack" } },
    { id: "stack.pop", label: "Pop", hint: "Pops the top value", icon: "pop", effect: { kind: "cells", types: ["stack"], op: "pop", noun: "a stack" } },
    pointer("stack", "top", "The top of the stack", { family: "cells", types: ["stack"], role: "end" }),
  ]),
  group("queue", [
    whole("queue", "Whole queue", "An empty queue"),
    { id: "queue.enqueue", label: "Enqueue", hint: "Adds a value at the back", icon: "push", effect: { kind: "cells", types: ["queue"], op: "push", noun: "a queue" } },
    { id: "queue.dequeue", label: "Dequeue", hint: "Takes the value at the front", icon: "pop", effect: { kind: "cells", types: ["queue"], op: "dequeue", noun: "a queue" } },
    pointer("queue", "front", "The front of the queue", { family: "cells", types: ["queue"], role: "start" }),
    pointer("queue", "back", "The back of the queue", { family: "cells", types: ["queue"], role: "end" }),
  ]),
  group("variables", [
    whole("variables", "Whole table", "Named values: counters, sums, answers"),
    { id: "variables.entry", label: "Variable", hint: "Adds a name and value", icon: "entry", effect: { kind: "entry", type: "variables", noun: "a variables table" } },
  ]),
  group("linkedList", [
    whole("linkedList", "Whole list", "Three nodes chained by next"),
    { id: "linkedList.node", label: "Node", hint: "Adds a node after the selected one, or at the end of the list", icon: "listNode", effect: { kind: "node", variant: "list" } },
    { id: "linkedList.null", label: "next → null", hint: "Points the selected node's next at null", icon: "null", effect: { kind: "null", variant: "list" } },
    { id: "linkedList.link", label: "next link", hint: "Links the two selected nodes, or picks the Link tool", icon: "link", effect: { kind: "link", variant: "list" } },
    pointer("linkedList", "head", "On the selected node, or the first node of the list", { family: "list", role: "first" }),
    pointer("linkedList", "tail", "On the selected node, or the last node of the list", { family: "list", role: "last" }),
    pointer("linkedList", "curr", "On the selected node, or the first", { family: "list", role: "first" }),
    pointer("linkedList", "prev", "On the selected node, or the first", { family: "list", role: "first" }),
    pointer("linkedList", "next", "On the selected node, or the second", { family: "list", role: "second" }),
    pointer("linkedList", "slow", "On the selected node, or the first", { family: "list", role: "first" }),
    pointer("linkedList", "fast", "On the selected node, or the first", { family: "list", role: "first" }),
  ]),
  group("tree", [
    whole("tree", "Whole tree", "A root with two children"),
    { id: "tree.node", label: "Node", hint: "Adds a child on a free side of the selected node", icon: "treeNode", effect: { kind: "node", variant: "tree" } },
    { id: "tree.left", label: "Left child", hint: "Adds a left child to the selected node", icon: "leftChild", effect: { kind: "child", side: "left" } },
    { id: "tree.right", label: "Right child", hint: "Adds a right child to the selected node", icon: "rightChild", effect: { kind: "child", side: "right" } },
    { id: "tree.null", label: "null children", hint: "Marks the selected node's missing children as null", icon: "null", effect: { kind: "null", variant: "tree" } },
    pointer("tree", "root", "On the selected node, or the root", { family: "tree" }),
    pointer("tree", "curr", "On the selected node, or the root", { family: "tree" }),
    pointer("tree", "node", "On the selected node, or the root", { family: "tree" }),
    pointer("tree", "p", "On the selected node, or the root", { family: "tree" }),
    pointer("tree", "q", "On the selected node, or the root", { family: "tree" }),
  ]),
  group(
    "graphNode",
    [
      whole("graphNode", "Whole graph", "Three connected vertices", graphTemplate),
      { id: "graphNode.node", label: "Node", hint: "Adds a neighbour of the selected node, or a lone vertex", icon: "treeNode", effect: { kind: "node", variant: "graph" } },
      { id: "graphNode.edge", label: "Edge", hint: "Connects the two selected nodes, or picks the Link tool", icon: "link", effect: { kind: "link", variant: "graph" } },
      pointer("graphNode", "u", "On the selected node", { family: "graph" }),
      pointer("graphNode", "v", "On the selected node", { family: "graph" }),
      pointer("graphNode", "curr", "On the selected node", { family: "graph" }),
    ],
    "Graph",
  ),
];

export const PART_GROUP_KINDS: readonly PaletteKind[] = PART_GROUPS.map((g) => g.kind);

const PARTS = new Map(PART_GROUPS.flatMap((g) => g.parts.map((p) => [p.id, p] as const)));

export function partById(id: string): Part | null {
  return PARTS.get(id) ?? null;
}

// Applying a part

export type ActiveCell = { elementId: string; index: number };

export type PartContext = {
  selection: ReadonlySet<string>;
  activeCell: ActiveCell | null;
  /** The highest order key in use, for new elements. */
  lastKey: string | null;
};

/** Where a part was dropped: the scene point, and the element and anchor under it (if any). */
export type PartDrop = { point: Point; elementId: string | null; anchor: Anchor | null };

/** The part of an element to start typing into after the part is added (the shapes of the store's EditTarget). */
export type PartEdit = { kind: "cell"; elementId: string; index: number } | { kind: "entry"; elementId: string; row: number; part: 0 };

export type PartOutcome =
  /** Changes to existing elements (or new ones attached to them), committed as one undo entry. */
  | { kind: "changes"; changes: Changes; select: string[]; activeCell?: ActiveCell | null; edit?: PartEdit }
  /** Something free-standing, placed like a palette item: at `at`, or the middle of the view. */
  | { kind: "insert"; elements: NewElement[]; at: Point | null }
  /** Nothing to add by itself: the learner finishes it with a tool. */
  | { kind: "tool"; tool: "link"; message: string }
  | { kind: "refused"; reason: string };

const refuse = (reason: string): PartOutcome => ({ kind: "refused", reason });

const liveList = (elements: ElementMap) => [...elements.values()].filter((el) => !el.isDeleted);
const liveGet = (elements: ElementMap, id: string | null | undefined) => {
  const el = id ? elements.get(id) : undefined;
  return el && !el.isDeleted ? el : undefined;
};
const isNode = (el: SketchElement | undefined, variant?: NodeVariant): el is ElementOf<"node"> =>
  el?.type === "node" && (!variant || el.variant === variant);

type Links = { live: ElementOf<"link">[]; neighbours: Map<string, string[]> };

function linksOf(elements: ElementMap): Links {
  const live = liveList(elements).filter((el): el is ElementOf<"link"> => el.type === "link");
  const neighbours = new Map<string, string[]>();
  const add = (a: string, b: string) => neighbours.set(a, [...(neighbours.get(a) ?? []), b]);
  for (const l of live) {
    if (!l.to) continue;
    add(l.from.elementId, l.to.elementId);
    add(l.to.elementId, l.from.elementId);
  }
  return { live, neighbours };
}

function componentFrom(links: Links, id: string): Set<string> {
  const seen = new Set([id]);
  const queue = [id];
  while (queue.length) {
    for (const n of links.neighbours.get(queue.shift()!) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  return seen;
}

/** The ids of the nodes linked to `nodeId` either way: its list, tree or graph. A copy is a structure of its own. */
export function structureOf(elements: ElementMap, nodeId: string): Set<string> {
  return componentFrom(linksOf(elements), nodeId);
}

/** Every structure of nodes of this variant on the canvas. */
function structuresOf(elements: ElementMap, variant: NodeVariant): Set<string>[] {
  const links = linksOf(elements);
  const out: Set<string>[] = [];
  const done = new Set<string>();
  for (const el of liveList(elements)) {
    if (!isNode(el, variant) || done.has(el.id)) continue;
    const comp = componentFrom(links, el.id);
    for (const id of comp) done.add(id);
    out.push(comp);
  }
  return out;
}

const nodesIn = (elements: ElementMap, ids: Iterable<string>) => [...ids].map((id) => liveGet(elements, id)).filter((el) => isNode(el));
const byX = (a: ElementOf<"node">, b: ElementOf<"node">) => a.x - b.x || a.y - b.y;
const byY = (a: ElementOf<"node">, b: ElementOf<"node">) => a.y - b.y || a.x - b.x;

const nextOf = (elements: ElementMap, links: Links, id: string) => {
  const l = links.live.find((k) => k.from.elementId === id && k.from.port === "next");
  return l?.to ? liveGet(elements, l.to.elementId) : undefined;
};

/** A list's nodes from its head along `next`; the head is the node nothing points at (the leftmost in a cycle). */
export function listOrder(elements: ElementMap, structure: ReadonlySet<string>): ElementOf<"node">[] {
  const links = linksOf(elements);
  const nodes = nodesIn(elements, structure).sort(byX) as ElementOf<"node">[];
  const pointedAt = new Set(links.live.flatMap((l) => (l.from.port === "next" && l.to && structure.has(l.from.elementId) ? [l.to.elementId] : [])));
  const head = nodes.find((n) => !pointedAt.has(n.id)) ?? nodes[0];
  const out: ElementOf<"node">[] = [];
  const seen = new Set<string>();
  for (let cur: SketchElement | undefined = head; isNode(cur) && !seen.has(cur.id); cur = nextOf(elements, links, cur.id)) {
    seen.add(cur.id);
    out.push(cur);
  }
  return out;
}

/** Tree nodes level by level from the root (the node no left or right link points at, topmost first). */
export function treeOrder(elements: ElementMap, structure: ReadonlySet<string>): ElementOf<"node">[] {
  const links = linksOf(elements);
  const nodes = (nodesIn(elements, structure) as ElementOf<"node">[]).sort(byY);
  const child = (id: string, side: "left" | "right") => {
    const l = links.live.find((k) => k.from.elementId === id && k.from.port === side);
    return l?.to ? liveGet(elements, l.to.elementId) : undefined;
  };
  const hasParent = new Set(links.live.flatMap((l) => (l.from.port !== "next" && l.from.port !== "edge" && l.to ? [l.to.elementId] : [])));
  const root = nodes.find((n) => !hasParent.has(n.id)) ?? nodes[0];
  const out: ElementOf<"node">[] = [];
  const seen = new Set<string>();
  const queue: (SketchElement | undefined)[] = [root];
  while (queue.length) {
    const cur = queue.shift();
    if (!isNode(cur) || seen.has(cur.id)) continue;
    seen.add(cur.id);
    out.push(cur);
    queue.push(child(cur.id, "left"), child(cur.id, "right"));
  }
  return out;
}

type NodeTarget = { node: ElementOf<"node"> } | { structure: Set<string> };

/**
 * The node a part acts on when it wasn't dropped on one: the one selected node, or the structure all the selected
 * nodes belong to, or (`canvas`) the only structure of this variant on the canvas. `anyVariant` lets a single
 * selected node of another variant count, as pointers do.
 */
function nodeTarget(elements: ElementMap, ctx: PartContext, variant: NodeVariant, opts: { canvas: boolean; anyVariant?: boolean }): NodeTarget | null {
  const picked = [...ctx.selection].map((id) => liveGet(elements, id)).filter((el) => isNode(el, opts.anyVariant ? undefined : variant));
  if (picked.length === 1) return { node: picked[0] };
  if (picked.length > 1) {
    const structure = structureOf(elements, picked[0].id);
    return picked.every((n) => structure.has(n.id)) ? { structure } : null;
  }
  if (!opts.canvas) return null;
  const all = structuresOf(elements, variant);
  return all.length === 1 ? { structure: all[0] } : null;
}

/**
 * The element a part acts on when it wasn't dropped on one: the one fitting element in the selection, else the
 * only one on the canvas (`strict` narrows that last step). Null when that's ambiguous or there's none.
 */
function pickTarget<T extends SketchElement>(
  elements: ElementMap,
  ctx: PartContext,
  fits: (el: SketchElement | undefined) => el is T,
  strict: (el: T) => boolean = () => true,
): T | null {
  const picked = [...ctx.selection].map((id) => liveGet(elements, id)).filter(fits);
  if (picked.length) return picked.length === 1 ? picked[0] : null;
  const all = liveList(elements).filter(fits).filter(strict);
  return all.length === 1 ? all[0] : null;
}

const cellsFit =
  (types: readonly CellsType[]) =>
  (el: SketchElement | undefined): el is CellsElement =>
    Boolean(el && isCells(el) && types.includes(el.type));
const variantFits = (variant: "array" | "string" | undefined) => (el: CellsElement) => !variant || el.type !== "array" || el.variant === variant;

/** The index a cell pointer goes on: the active cell of that element, else by its role. */
function roleIndex(el: CellsElement, ctx: PartContext, role: CellRole): number {
  const n = el.values.length;
  if (ctx.activeCell?.elementId === el.id && ctx.activeCell.index < n) return ctx.activeCell.index;
  if (role === "start") return 0;
  if (role === "second") return Math.min(1, Math.max(0, n - 1));
  if (role === "middle") return Math.max(0, Math.floor((n - 1) / 2));
  return n - 1;
}

/** Where a pointer part binds when it wasn't dropped on anything. */
function pointerAnchor(elements: ElementMap, ctx: PartContext, on: PointerOn): Anchor | null {
  if (on.family === "list" || on.family === "tree" || on.family === "graph") {
    const t = nodeTarget(elements, ctx, on.family, { canvas: true, anyVariant: true });
    if (!t) return null;
    if ("node" in t) return { kind: "node", elementId: t.node.id };
    let node: ElementOf<"node"> | undefined;
    if (on.family === "list") {
      const order = listOrder(elements, t.structure);
      node = on.role === "last" ? order[order.length - 1] : on.role === "second" ? (order[1] ?? order[0]) : order[0];
    } else if (on.family === "tree") node = treeOrder(elements, t.structure)[0];
    else node = (nodesIn(elements, t.structure) as ElementOf<"node">[]).sort(byY)[0];
    return node ? { kind: "node", elementId: node.id } : null;
  }
  if (on.family === "matrix") {
    const el = pickTarget(elements, ctx, (e): e is ElementOf<"matrix"> => e?.type === "matrix");
    return el ? { kind: "cellAt", elementId: el.id, row: 0, col: 0 } : null;
  }
  // Any selected row of cells takes the pointer; on the canvas, only the kind the part belongs to counts.
  const selected = pickTarget(elements, ctx, cellsFit(CELL_TYPES), () => false);
  const el = selected ?? pickTarget(elements, { ...ctx, selection: new Set() }, cellsFit(on.types), variantFits(on.variant));
  return el ? { kind: "cell", elementId: el.id, index: roleIndex(el, ctx, on.role) } : null;
}

function sameAnchor(a: Anchor, b: Anchor): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Whether two anchors are on one structure: one element, or nodes linked to each other. */
function sameStructure(elements: ElementMap, a: Anchor, b: Anchor): boolean {
  if (a.elementId === b.elementId) return true;
  return a.kind === "node" && b.kind === "node" && structureOf(elements, a.elementId).has(b.elementId);
}

/**
 * A pointer named `name` on `anchor`. One with that name already on the same structure moves there instead, so
 * clicking `head` twice doesn't make two heads (a copy of the list for another step keeps its own).
 */
function placePointer(elements: ElementMap, ctx: PartContext, name: string, anchor: Anchor): PartOutcome {
  const existing = liveList(elements).find(
    (el): el is ElementOf<"pointer"> => el.type === "pointer" && el.name === name && el.target !== null && sameStructure(elements, el.target, anchor),
  );
  if (existing) {
    if (sameAnchor(existing.target!, anchor)) return { kind: "changes", changes: [], select: [existing.id] };
    const label = pointerLabelFor(elements, anchor, name, existing.id) ?? { x: existing.x, y: existing.y };
    return { kind: "changes", changes: [withChanges(existing, { target: anchor, end: undefined, ...label })], select: [existing.id] };
  }
  const label = pointerLabelFor(elements, anchor, name);
  if (!label) return refuse("That spot can't take a pointer.");
  const created = createPointer(elements, label, anchor, label, ctx.lastKey, name);
  return { kind: "changes", changes: [created], select: [created.id] };
}

function freePointer(name: string, at: Point | null): PartOutcome {
  return { kind: "insert", elements: [{ type: "pointer", x: 0, y: 0, name, target: null, end: { x: 12, y: 64 } }], at };
}

/**
 * The element (and anchor) a drop onto `drop` attaches the part to, or null when the part doesn't go there. The
 * canvas highlights this while a part is dragged over it.
 */
export function partDropTarget(elements: ElementMap, part: Part, drop: PartDrop): { elementId: string; anchor: Anchor | null } | null {
  const el = liveGet(elements, drop.elementId ?? drop.anchor?.elementId);
  if (!el) return null;
  const e = part.effect;
  const nodeAnchor = { kind: "node", elementId: el.id } as const;
  switch (e.kind) {
    case "whole":
      return null;
    case "node":
    case "link":
      return isNode(el, e.variant) ? { elementId: el.id, anchor: nodeAnchor } : null;
    case "child":
      return isNode(el, "tree") ? { elementId: el.id, anchor: nodeAnchor } : null;
    case "null":
      return isNode(el, e.variant) ? { elementId: el.id, anchor: nodeAnchor } : null;
    case "pointer":
      if (drop.anchor) return { elementId: drop.anchor.elementId, anchor: drop.anchor };
      // Dropped on another pointer's name: it joins that pointer on its target.
      if (el.type === "pointer") return el.target && liveGet(elements, el.target.elementId) ? { elementId: el.target.elementId, anchor: el.target } : null;
      if (isCells(el)) return { elementId: el.id, anchor: null };
      return el.type === "matrix" ? { elementId: el.id, anchor: null } : null;
    case "cells":
      if (!cellsFit(e.types)(el)) return null;
      return { elementId: el.id, anchor: e.op === "insert" && drop.anchor?.kind === "cell" ? drop.anchor : null };
    case "entry":
      return el.type === e.type ? { elementId: el.id, anchor: null } : null;
    case "grow":
      return el.type === "matrix" ? { elementId: el.id, anchor: null } : null;
  }
}

/** The shape to highlight for a drop target. */
export function dropTargetShape(elements: ElementMap, target: { elementId: string; anchor: Anchor | null }): Shape | null {
  if (target.anchor) return anchorShape(elements, target.anchor);
  const el = liveGet(elements, target.elementId);
  if (isNode(el)) return nodeShape(el);
  const b = el && elementBounds(el);
  return b ? { kind: "rect", rect: b } : null;
}

const needs = (noun: string, label: string) => `Select ${noun} first, or drop “${label}” on one.`;

/** Parts that only make sense on an element: dropped on one they don't fit, they're refused. */
const ATTACHED_ONLY = new Set<PartEffect["kind"]>(["child", "null", "link", "cells", "entry", "grow"]);

/**
 * What adding `part` does, without changing anything: the store commits the changes, places the free-standing
 * elements or switches tools. `drop` is where it was dropped, if it was dragged onto the canvas. A part that
 * needs an element and is dropped on empty canvas falls back to the selection, as a click does.
 */
export function applyPart(elements: ElementMap, ctx: PartContext, part: Part, drop?: PartDrop): PartOutcome {
  const e = part.effect;
  const fit = drop ? partDropTarget(elements, part, drop) : null;
  const dropped = fit ? liveGet(elements, fit.elementId) : undefined;
  const at = drop?.point ?? null;
  if (drop?.elementId && !fit && ATTACHED_ONLY.has(e.kind)) return refuse(`“${part.label}” doesn't go there.`);

  switch (e.kind) {
    case "whole":
      return { kind: "insert", elements: e.make(), at };

    case "node": {
      // A node dropped on empty canvas stays where it was dropped.
      const t: NodeTarget | null = isNode(dropped) ? { node: dropped } : drop ? null : nodeTarget(elements, ctx, e.variant, { canvas: e.variant !== "graph" });
      const free = (): PartOutcome => ({ kind: "insert", elements: template(e.variant === "list" ? "listNode" : e.variant === "tree" ? "treeNode" : "graphNode"), at });
      if (!t) return free();
      if (e.variant === "list") {
        const node = "node" in t ? t.node : listOrder(elements, t.structure).at(-1);
        if (!node) return free();
        const made = addNextNode(elements, node, ctx.lastKey);
        return { kind: "changes", changes: made.changes, select: [made.created] };
      }
      if (e.variant === "tree") {
        const candidates = "node" in t ? [t.node] : treeOrder(elements, t.structure);
        for (const node of candidates) {
          for (const side of ["left", "right"] as const) {
            const made = addChild(elements, node, side, ctx.lastKey);
            if (made) return { kind: "changes", changes: made.changes, select: [made.created] };
          }
        }
        return refuse("That node already has both children.");
      }
      if (!("node" in t)) return free();
      const made = addChild(elements, t.node, "edge", ctx.lastKey)!;
      return { kind: "changes", changes: made.changes, select: [made.created] };
    }

    case "child": {
      const node = isNode(dropped, "tree") ? dropped : soleNode(elements, ctx, "tree");
      if (!node) return refuse(needs("a tree node", part.label));
      const made = addChild(elements, node, e.side, ctx.lastKey);
      if (!made) return refuse(`That node already has a ${e.side} child.`);
      return { kind: "changes", changes: made.changes, select: [made.created] };
    }

    case "null": {
      if (e.variant === "list") {
        let node: ElementOf<"node"> | undefined = isNode(dropped, "list") ? dropped : undefined;
        if (!node) {
          const t = nodeTarget(elements, ctx, "list", { canvas: true });
          node = t ? ("node" in t ? t.node : listOrder(elements, t.structure).at(-1)) : undefined;
        }
        if (!node) return refuse(needs("a list node", part.label));
        const changes = connect(elements, node, "next", null, ctx.lastKey);
        if (!changes.length) return refuse("That node's next is already null.");
        return { kind: "changes", changes, select: [node.id] };
      }
      const node = isNode(dropped, "tree") ? dropped : soleNode(elements, ctx, "tree");
      if (!node) return refuse(needs("a tree node", part.label));
      const taken = new Set(liveList(elements).flatMap((el) => (el.type === "link" && el.from.elementId === node.id ? [el.from.port] : [])));
      const changes: Changes = [];
      for (const side of ["left", "right"] as const) {
        if (!taken.has(side)) changes.push(...connect(elements, node, side, null, changes.at(-1)?.index ?? ctx.lastKey));
      }
      if (!changes.length) return refuse("Both of that node's children are already set.");
      return { kind: "changes", changes, select: [node.id] };
    }

    case "link": {
      const port = e.variant === "list" ? "next" : "edge";
      const selected = [...ctx.selection].map((id) => liveGet(elements, id)).filter((el) => isNode(el, e.variant)) as ElementOf<"node">[];
      if (isNode(dropped, e.variant)) {
        const from = selected.filter((n) => n.id !== dropped.id);
        if (from.length !== 1) return refuse("Select the node the link starts from, then drop this on the node it goes to.");
        const changes = connect(elements, from[0], port, dropped, ctx.lastKey);
        return changes.length ? { kind: "changes", changes, select: [dropped.id] } : refuse("Those nodes are already linked.");
      }
      if (selected.length === 2) {
        const changes = connect(elements, selected[0], port, selected[1], ctx.lastKey);
        return changes.length ? { kind: "changes", changes, select: [selected[1].id] } : refuse("Those nodes are already linked.");
      }
      return { kind: "tool", tool: "link", message: "Drag from one node to another to link them." };
    }

    case "pointer": {
      let anchor: Anchor | null = null;
      if (fit?.anchor) anchor = fit.anchor;
      else if (dropped && isCells(dropped)) {
        anchor = { kind: "cell", elementId: dropped.id, index: roleIndex(dropped, ctx, e.on.family === "cells" ? e.on.role : "start") };
      } else if (dropped?.type === "matrix") anchor = { kind: "cellAt", elementId: dropped.id, row: 0, col: 0 };
      else if (!drop) anchor = pointerAnchor(elements, ctx, e.on);
      return anchor ? placePointer(elements, ctx, e.name, anchor) : freePointer(e.name, at);
    }

    case "cells": {
      const el = cellsFit(e.types)(dropped) ? dropped : pickTarget(elements, ctx, cellsFit(e.types), variantFits(e.variant));
      if (!el) return refuse(needs(e.noun, part.label));
      const n = el.values.length;
      if (e.op === "pop" || e.op === "dequeue") {
        if (!n) return refuse("It's already empty.");
        return { kind: "changes", changes: removeCell(el, e.op === "pop" ? n - 1 : 0), select: [el.id], activeCell: null };
      }
      let index = n;
      if (e.op === "insert") {
        const onCell = fit?.anchor?.kind === "cell" ? fit.anchor.index : ctx.activeCell?.elementId === el.id ? ctx.activeCell.index : n;
        index = Math.max(0, Math.min(onCell, n));
      }
      const changes = insertCell(el, index);
      if (!changes.length) return refuse("It's full.");
      return { kind: "changes", changes, select: [el.id], activeCell: { elementId: el.id, index }, edit: { kind: "cell", elementId: el.id, index } };
    }

    case "entry": {
      const fits = (x: SketchElement | undefined): x is ElementOf<"hashmap" | "variables"> => x?.type === e.type;
      const el = fits(dropped) ? dropped : pickTarget(elements, ctx, fits);
      if (!el) return refuse(needs(e.noun, part.label));
      const changes = addEntry(el);
      if (!changes.length) return refuse("It's full.");
      return { kind: "changes", changes, select: [el.id], edit: { kind: "entry", elementId: el.id, row: el.entries.length, part: 0 } };
    }

    case "grow": {
      const fits = (x: SketchElement | undefined): x is ElementOf<"matrix"> => x?.type === "matrix";
      const el = fits(dropped) ? dropped : pickTarget(elements, ctx, fits);
      if (!el) return refuse(needs("a grid", part.label));
      const rows = el.rows.length + (e.along === "row" ? 1 : 0);
      const cols = el.rows[0].length + (e.along === "column" ? 1 : 0);
      if (rows > MAX_MATRIX || cols > MAX_MATRIX) return refuse("The grid is at its largest.");
      return { kind: "changes", changes: resizeMatrix(el, rows, cols), select: [el.id] };
    }
  }
}

/** The one tree node selected, or the only tree node on the canvas. */
function soleNode(elements: ElementMap, ctx: PartContext, variant: NodeVariant): ElementOf<"node"> | null {
  const t = nodeTarget(elements, ctx, variant, { canvas: false });
  if (t && "node" in t) return t.node;
  if (t) return null;
  const all = liveList(elements).filter((el) => isNode(el, variant));
  return all.length === 1 ? (all[0] as ElementOf<"node">) : null;
}
