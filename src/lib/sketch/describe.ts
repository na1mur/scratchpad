import { isCells, isTable, type Anchor, type SketchElement } from "./types";

/**
 * Plain-language names for elements, read out to screen readers as the selection changes (the canvas itself is
 * pictures). Kept short: what it is, its name, and its contents.
 */

const KIND: Record<SketchElement["type"], string> = {
  array: "Array",
  stack: "Stack",
  queue: "Queue",
  set: "Set",
  matrix: "Matrix",
  hashmap: "Hash map",
  variables: "Variables",
  node: "Node",
  link: "Link",
  pointer: "Pointer",
  note: "Note",
  text: "Text",
  freehand: "Drawing",
  shape: "Shape",
  line: "Line",
};

const SHAPE_NAMES = { rectangle: "Rectangle", rounded: "Rounded rectangle", ellipse: "Ellipse", diamond: "Diamond" } as const;

const list = (values: readonly string[]) => values.map((v) => v || "empty").join(", ");

const quote = (text: string) => {
  const line = text.trim().split("\n")[0];
  return `"${line.length > 40 ? `${line.slice(0, 40)}…` : line}"`;
};

function nameOf(elements: ReadonlyMap<string, SketchElement>, id: string): string {
  const el = elements.get(id);
  if (!el) return "a removed element";
  if (el.type === "node") return `node ${el.value || "(empty)"}`;
  if (el.type === "shape") return `${SHAPE_NAMES[el.shape].toLowerCase()}${el.text.trim() ? ` ${quote(el.text)}` : ""}`;
  if ((el.type === "note" || el.type === "text") && el.text.trim()) return `${el.type} ${quote(el.text)}`;
  return "label" in el && el.label ? el.label : KIND[el.type].toLowerCase();
}

function anchorText(elements: ReadonlyMap<string, SketchElement>, a: Anchor): string {
  const name = nameOf(elements, a.elementId);
  switch (a.kind) {
    case "cell":
      return `${name} index ${a.index}`;
    case "cellAt":
      return `${name} row ${a.row} column ${a.col}`;
    case "entry":
      return `${name} key ${a.key || "(empty)"}`;
    case "node":
      return name;
  }
}

export function describeElement(elements: ReadonlyMap<string, SketchElement>, el: SketchElement): string {
  if (isCells(el)) {
    const what = el.type === "array" && el.variant === "string" ? "String" : KIND[el.type];
    return `${what} ${el.label}, ${el.values.length} ${el.values.length === 1 ? "value" : "values"}${el.values.length ? `: ${list(el.values)}` : ""}`;
  }
  if (isTable(el)) {
    const entries = el.entries.map(([k, v]) => `${k || "empty"} ${el.type === "variables" ? "=" : "to"} ${v || "empty"}`);
    return `${KIND[el.type]} ${el.label}, ${entries.length ? entries.join("; ") : "empty"}`;
  }
  switch (el.type) {
    case "matrix":
      return `Matrix ${el.label}, ${el.rows.length} by ${el.rows[0]?.length ?? 0}`;
    case "node":
      return `${el.variant === "list" ? "List" : el.variant === "tree" ? "Tree" : "Graph"} node ${el.value || "(empty)"}`;
    case "link":
      return `Link ${el.from.port} from ${nameOf(elements, el.from.elementId)} to ${el.to ? nameOf(elements, el.to.elementId) : "null"}`;
    case "pointer":
      return `Pointer ${el.name}${el.target ? ` on ${anchorText(elements, el.target)}` : ", not pointing at anything"}`;
    case "note":
      return `Note: ${el.text || "empty"}`;
    case "text":
      return `Text: ${el.text || "empty"}`;
    case "freehand":
      return "Drawing";
    case "shape":
      return `${SHAPE_NAMES[el.shape]}${el.text.trim() ? `: ${el.text}` : ""}`;
    case "line": {
      const heads = [el.startHead, el.endHead].filter((h) => h && h !== "none").length;
      const what = heads === 2 ? "Double-headed arrow" : heads === 1 ? "Arrow" : "Line";
      // Which way an arrow points: a head on the start alone means it points back at the start.
      const reversed = el.startHead && el.startHead !== "none" && (!el.endHead || el.endHead === "none");
      const [a, b] = reversed ? [el.endBinding, el.startBinding] : [el.startBinding, el.endBinding];
      const ends = [a && ` from ${nameOf(elements, a.elementId)}`, b && ` to ${nameOf(elements, b.elementId)}`].filter(Boolean).join("");
      return `${what}${ends}${el.points.length > 2 ? ` through ${el.points.length} points` : ""}`;
    }
  }
}
