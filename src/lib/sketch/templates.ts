import { createElement, randomId } from "./elements";
import { keysAfter } from "./order";
import { isCells, type Anchor, type LineBinding, type NewElement, type SketchElement } from "./types";
import type { Point } from "./layout";

/**
 * Palette items and how anything is placed on the canvas. A template is a list of elements around (0, 0) whose
 * links and pointers refer to each other by local ids; `instantiate()` gives everything fresh ids, remaps those
 * references and moves it into place. Duplicate and paste use the same path, as Excalidraw does for its library.
 */

export const PALETTE_KINDS = [
  "array",
  "string",
  "matrix",
  "hashmap",
  "set",
  "stack",
  "queue",
  "variables",
  "linkedList",
  "listNode",
  "tree",
  "treeNode",
  "graphNode",
] as const;
export type PaletteKind = (typeof PALETTE_KINDS)[number];

export const PALETTE_LABELS: Record<PaletteKind, { label: string; hint: string }> = {
  array: { label: "Array", hint: "Values in indexed cells" },
  string: { label: "String", hint: "Characters in indexed cells" },
  matrix: { label: "Matrix", hint: "A grid of rows and columns" },
  hashmap: { label: "Hash map", hint: "Keys and their values" },
  set: { label: "Set", hint: "Values without order" },
  stack: { label: "Stack", hint: "Push and pop at the top" },
  queue: { label: "Queue", hint: "In at the back, out at the front" },
  variables: { label: "Variables", hint: "Named values: counters, sums, answers" },
  linkedList: { label: "Linked list", hint: "Three nodes chained by next" },
  listNode: { label: "List node", hint: "One node; link it with the Link tool" },
  tree: { label: "Binary tree", hint: "A root with two children" },
  treeNode: { label: "Tree node", hint: "One node; link it with the Link tool" },
  graphNode: { label: "Graph node", hint: "A vertex; connect it with the Link tool" },
};

const cellsOf = (values: string[]) => ({ values, cellIds: values.map(() => randomId()) });

/** The elements a palette item places, around (0, 0). */
export function template(kind: PaletteKind): NewElement[] {
  switch (kind) {
    case "array":
      return [{ type: "array", x: 0, y: 0, label: "nums", variant: "array", ...cellsOf(["", "", "", ""]) }];
    case "string":
      return [{ type: "array", x: 0, y: 0, label: "s", variant: "string", ...cellsOf(["a", "b", "c"]) }];
    case "matrix":
      return [{ type: "matrix", x: 0, y: 0, label: "grid", rows: [["", "", ""], ["", "", ""], ["", "", ""]] }];
    case "hashmap":
      return [{ type: "hashmap", x: 0, y: 0, label: "map", entries: [["", ""]] }];
    case "set":
      return [{ type: "set", x: 0, y: 0, label: "seen", ...cellsOf([]) }];
    case "stack":
      return [{ type: "stack", x: 0, y: 0, label: "stack", ...cellsOf([]) }];
    case "queue":
      return [{ type: "queue", x: 0, y: 0, label: "queue", ...cellsOf([]) }];
    case "variables":
      return [{ type: "variables", x: 0, y: 0, label: "", entries: [["ans", "0"]] }];
    case "listNode":
      return [{ type: "node", x: 0, y: 0, variant: "list", value: "" }];
    case "treeNode":
      return [{ type: "node", x: 0, y: 0, variant: "tree", value: "" }];
    case "graphNode":
      return [{ type: "node", x: 0, y: 0, variant: "graph", value: "" }];
    case "linkedList":
      return listTemplate(["1", "2", "3"], -1);
    case "tree":
      return [
        { id: "r", type: "node", x: 56, y: 0, variant: "tree", value: "2" },
        { id: "a", type: "node", x: 0, y: 72, variant: "tree", value: "1" },
        { id: "b", type: "node", x: 112, y: 72, variant: "tree", value: "3" },
        { type: "link", x: 0, y: 0, from: { elementId: "r", port: "left" }, to: { elementId: "a" } },
        { type: "link", x: 0, y: 0, from: { elementId: "r", port: "right" }, to: { elementId: "b" } },
      ];
  }
}

/** Nodes in a row chained by `next`; the tail points at null, or back at node `cycleTo` when it's ≥ 0. */
export function listTemplate(values: readonly string[], cycleTo: number, at: Point = { x: 0, y: 0 }, prefix = "n"): NewElement[] {
  const out: NewElement[] = values.map((value, i) => ({
    id: `${prefix}${i}`,
    type: "node",
    x: at.x + i * 88,
    y: at.y,
    variant: "list",
    value,
  }));
  values.forEach((_, i) => {
    const last = i === values.length - 1;
    const to = last ? (cycleTo >= 0 && cycleTo < values.length ? `${prefix}${cycleTo}` : null) : `${prefix}${i + 1}`;
    out.push({ type: "link", x: 0, y: 0, from: { elementId: `${prefix}${i}`, port: "next" }, to: to ? { elementId: to } : null });
  });
  return out;
}

/**
 * Places elements: fresh ids (and cell ids), references inside the set remapped, references to elements outside
 * it kept, positions moved by `offset`, order keys after `lastKey`. The input keeps its order.
 */
export function instantiate(
  elements: readonly (NewElement | SketchElement)[],
  offset: Point,
  lastKey: string | null,
  opts: { keepOrigin?: boolean } = {},
): SketchElement[] {
  const ids = new Map<string, string>();
  for (const el of elements) if (el.id) ids.set(el.id, randomId());
  const remap = (id: string) => ids.get(id) ?? id;
  const keys = keysAfter(lastKey, elements.length);

  return elements.map((el, i) => {
    const fields = { ...el } as NewElement & Partial<SketchElement>;
    const originId = opts.keepOrigin ? fields.originId ?? fields.id : undefined;
    for (const k of ["index", "version", "versionNonce", "updated", "isDeleted", "frameId", "originId"] as const) delete fields[k];
    fields.id = el.id ? remap(el.id) : undefined;
    if (fields.type !== "link") {
      fields.x += offset.x;
      fields.y += offset.y;
    }
    if (isCells(fields as SketchElement)) {
      const cells = fields as { values: string[]; cellIds: string[] };
      cells.cellIds = cells.values.map(() => randomId());
    }
    if (fields.type === "link") {
      fields.from = { ...fields.from, elementId: remap(fields.from.elementId) };
      fields.to = fields.to && { elementId: remap(fields.to.elementId) };
    }
    if (fields.type === "pointer") {
      fields.target = fields.target && ({ ...fields.target, elementId: remap(fields.target.elementId) } as Anchor);
      if (fields.end) fields.end = { x: fields.end.x + offset.x, y: fields.end.y + offset.y };
    }
    if (fields.type === "line") {
      // An arrow stays attached only to elements copied with it; the original's would pull it back.
      const rebind = (b: LineBinding | null | undefined) => (b && ids.has(b.elementId) ? { elementId: remap(b.elementId) } : null);
      if (fields.startBinding) fields.startBinding = rebind(fields.startBinding);
      if (fields.endBinding) fields.endBinding = rebind(fields.endBinding);
    }
    const placed = createElement(fields, keys[i]);
    return originId ? { ...placed, originId } : placed;
  });
}
