import { hierarchy, tree as d3tree } from "d3-hierarchy";
import { parseType, type HarnessView, type PublicTestCase, type ValueType } from "@/lib/harness/types";
import { CELL_H, INDEX_H, LABEL_H, NODE_D } from "./layout";
import { listTemplate } from "./templates";
import { MAX_CELLS, MAX_MATRIX, MAX_VALUE_LENGTH, type NewElement } from "./types";

/**
 * "Start from case": a fixed test case's arguments laid out as elements, top to bottom, in the harness runtime's
 * conventions (arrays as cells, a list as nodes chained by next with LeetCode's `pos` cycle, a tree from its
 * level-order array). Scalars share one variables box at the end. Anything too big is cut and reported.
 */

export type ReadyHarnessView = Extract<HarnessView, { status: "ready" }>;

const MAX_NODES = 15;
const GAP = 32;
const POINTER_ROW = 40;

const text = (v: unknown): string => {
  const s = v === null ? "null" : typeof v === "string" ? v : JSON.stringify(v);
  return s.length > MAX_VALUE_LENGTH ? `${s.slice(0, MAX_VALUE_LENGTH - 1)}…` : s;
};

type Placed = { elements: NewElement[]; height: number };

export function seedFromCase(harness: ReadyHarnessView, testCase: PublicTestCase): { elements: NewElement[]; cut: string[] } {
  let args: Record<string, unknown>;
  try {
    args = JSON.parse(testCase.argsJson) as Record<string, unknown>;
  } catch {
    return { elements: [], cut: [] };
  }
  const out: NewElement[] = [];
  const cut: string[] = [];
  const scalars: [string, string][] = [];
  let y = 0;
  const cycleParam = harness.cycle?.param;
  const pos = harness.cycle ? Number(args[harness.cycle.pos]) : -1;

  for (const param of harness.params) {
    if (param.name === harness.cycle?.pos) continue;
    const t = parseType(param.type);
    const value = args[param.name];
    const placed = t ? place(param.name, t, value, y, param.name === cycleParam ? pos : -1, cut) : null;
    if (placed) {
      out.push(...placed.elements);
      y += placed.height + GAP;
    } else {
      scalars.push([param.name, text(value)]);
    }
  }
  if (scalars.length) out.push({ type: "variables", x: 0, y, label: "", entries: scalars.slice(0, 12) });
  return { elements: out, cut };
}

/** One argument as elements at height `y`, or null for a value that belongs in the variables box. */
function place(name: string, t: ValueType, value: unknown, y: number, cycleTo: number, cut: string[]): Placed | null {
  if (t.kind === "string" && typeof value === "string") {
    const chars = [...value];
    if (chars.length > MAX_CELLS) cut.push(name);
    return cells(name, chars.slice(0, MAX_CELLS), "string", y);
  }
  if (t.kind === "array" && Array.isArray(value)) {
    if (t.of.kind === "array") return matrix(name, value, y, cut);
    if (t.of.kind === "list" || t.of.kind === "tree") return null;
    if (value.length > MAX_CELLS) cut.push(name);
    return cells(name, value.slice(0, MAX_CELLS).map(text), t.of.kind === "char" ? "string" : "array", y);
  }
  if (t.kind === "list" && Array.isArray(value) && value.length) {
    if (value.length > MAX_NODES) cut.push(name);
    const values = value.slice(0, MAX_NODES).map(text);
    const prefix = `${name}_`;
    return {
      elements: [
        { type: "pointer", x: 0, y, name: clip(name), target: { kind: "node", elementId: `${prefix}0` } },
        ...listTemplate(values, cycleTo < values.length ? cycleTo : -1, { x: 0, y: y + POINTER_ROW }, prefix),
      ],
      height: POINTER_ROW + NODE_D,
    };
  }
  if (t.kind === "tree" && Array.isArray(value) && value.length && value[0] !== null) {
    return binaryTree(name, value, y, cut);
  }
  return null;
}

const clip = (name: string) => name.slice(0, 16);

function cells(name: string, values: string[], variant: "array" | "string", y: number): Placed {
  return {
    elements: [{ type: "array", x: 0, y, label: name, variant, values, cellIds: [] }],
    height: LABEL_H + CELL_H + INDEX_H,
  };
}

function matrix(name: string, value: unknown[], y: number, cut: string[]): Placed {
  const rows = value.slice(0, MAX_MATRIX).map((row) => (Array.isArray(row) && row.length ? row.slice(0, MAX_MATRIX).map(text) : [""]));
  if (value.length > MAX_MATRIX || value.some((r) => Array.isArray(r) && r.length > MAX_MATRIX)) cut.push(name);
  if (!rows.length) rows.push([""]);
  return { elements: [{ type: "matrix", x: 0, y, label: name, rows }], height: LABEL_H + INDEX_H + rows.length * CELL_H };
}

type TreeItem = { id: string; value: string; left: TreeItem | null; right: TreeItem | null; hole?: boolean };

/** A tree from LeetCode's level-order array, laid out with d3's tidy tree. */
function binaryTree(name: string, values: unknown[], y: number, cut: string[]): Placed {
  const prefix = `${name}_`;
  let count = 0;
  const make = (v: unknown): TreeItem => ({ id: `${prefix}${count++}`, value: text(v), left: null, right: null });
  const root = make(values[0]);
  const queue = [root];
  let i = 1;
  while (queue.length && i < values.length) {
    const node = queue.shift()!;
    for (const side of ["left", "right"] as const) {
      if (i >= values.length) break;
      const v = values[i++];
      if (v === null) continue;
      if (count >= MAX_NODES) {
        cut.push(name);
        queue.length = 0;
        break;
      }
      node[side] = make(v);
      queue.push(node[side]);
    }
  }

  // Missing children become invisible holes, so a lone child still leans to its own side.
  const hole = (): TreeItem => ({ id: "", value: "", left: null, right: null, hole: true });
  const h = hierarchy(root, (n) => (n.left || n.right ? [n.left ?? hole(), n.right ?? hole()] : undefined));
  d3tree<TreeItem>().nodeSize([56, 72])(h);
  const placed = h.descendants().filter((d) => !d.data.hole);
  const minX = Math.min(...placed.map((d) => d.x ?? 0));
  const top = y + POINTER_ROW;

  const elements: NewElement[] = [{ type: "pointer", x: (h.x ?? 0) - minX + 4, y, name: clip(name), target: { kind: "node", elementId: root.id } }];
  for (const d of placed) {
    elements.push({ id: d.data.id, type: "node", x: (d.x ?? 0) - minX, y: top + (d.y ?? 0), variant: "tree", value: d.data.value });
  }
  for (const d of placed) {
    for (const side of ["left", "right"] as const) {
      const child = d.data[side];
      if (child) elements.push({ type: "link", x: 0, y: 0, from: { elementId: d.data.id, port: side }, to: { elementId: child.id } });
    }
  }
  const depth = Math.max(...placed.map((d) => d.depth));
  return { elements, height: POINTER_ROW + depth * 72 + NODE_D };
}
