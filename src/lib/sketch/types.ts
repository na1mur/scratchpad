import { z } from "zod";

/**
 * Sketch: the learner's canvas for a problem (docs/sketch-plan.md). A sketch is a flat list of elements keyed by
 * id. A change makes a new element object with a higher `version` (elements.ts), deleting only sets `isDeleted`,
 * and `index` is a fractional key that orders them (order.ts). The server checks every save against these
 * schemas and then repairs what they can't express (restore.ts). Safe to import on the client.
 */

export const SKETCH_SCHEMA_VERSION = 1;
export const MAX_LIVE_ELEMENTS = 400;
/** Live elements plus recent deletions, which are kept so a save from another tab can't bring them back. */
export const MAX_STORED_ELEMENTS = 1000;
export const MAX_SKETCH_BYTES = 256 * 1024;
export const MAX_CELLS = 16;
export const MAX_ENTRIES = 12;
export const MAX_MATRIX = 8;
export const MAX_VALUE_LENGTH = 24;
export const MAX_LABEL_LENGTH = 40;
export const MAX_POINTER_NAME = 16;
export const MAX_TEXT_LENGTH = 1000;
export const MAX_FREEHAND_POINTS = 1500;
export const MAX_IMAGE_NAME_LENGTH = 80;

const id = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, "Invalid id");
const coord = z.number().finite().min(-100_000).max(100_000);
const value = z.string().max(MAX_VALUE_LENGTH);
const label = z.string().max(MAX_LABEL_LENGTH);

const base = z.object({
  id,
  /** Scene coordinates of the top-left corner. Unused by links, whose ends follow their nodes. */
  x: coord,
  y: coord,
  /** Fractional order key: later keys draw on top. */
  index: z.string().min(1).max(100),
  version: z.number().int().min(1),
  /** New random number on every change; breaks ties between equal versions from two tabs. */
  versionNonce: z.number().int(),
  updated: z.number().finite(),
  isDeleted: z.boolean(),
  /** The storyboard frame the element belongs to (not drawn yet). */
  frameId: id.nullable(),
  /** The element this one was copied from, so a structure keeps its identity across frames. */
  originId: id.optional(),
});

const cells = {
  label,
  values: z.array(value).max(MAX_CELLS),
  /** One stable id per cell, so a moved value can be followed. Same length as `values` (restore.ts fixes it). */
  cellIds: z.array(id).max(MAX_CELLS),
};

export const arrayElementSchema = base.extend({
  type: z.literal("array"),
  ...cells,
  /** "string" draws the cells as characters. */
  variant: z.enum(["array", "string"]),
});
/** Bottom first: the last value is the top. */
export const stackElementSchema = base.extend({ type: z.literal("stack"), ...cells });
/** Front first. */
export const queueElementSchema = base.extend({ type: z.literal("queue"), ...cells });
export const setElementSchema = base.extend({ type: z.literal("set"), ...cells });
export const matrixElementSchema = base.extend({
  type: z.literal("matrix"),
  label,
  rows: z.array(z.array(value).min(1).max(MAX_MATRIX)).min(1).max(MAX_MATRIX),
});
export const hashmapElementSchema = base.extend({
  type: z.literal("hashmap"),
  label,
  entries: z.array(z.tuple([value, value])).max(MAX_ENTRIES),
});
/** Named values: `entries` are [name, value]. */
export const variablesElementSchema = base.extend({
  type: z.literal("variables"),
  label,
  entries: z.array(z.tuple([value, value])).max(MAX_ENTRIES),
});

export const NODE_VARIANTS = ["list", "tree", "graph"] as const;
export type NodeVariant = (typeof NODE_VARIANTS)[number];
export const nodeElementSchema = base.extend({
  type: z.literal("node"),
  variant: z.enum(NODE_VARIANTS),
  value,
});

/** Which link leaves a node: `next` for list nodes, `left`/`right` for tree nodes, `edge` for graph nodes. */
export const LINK_PORTS = ["next", "left", "right", "edge"] as const;
export type LinkPort = (typeof LINK_PORTS)[number];
export const linkElementSchema = base.extend({
  type: z.literal("link"),
  from: z.object({ elementId: id, port: z.enum(LINK_PORTS) }),
  /** null: the link points at null (drawn as "null"). Graph edges always have a target. */
  to: z.object({ elementId: id }).nullable(),
});

/**
 * What a pointer points at. A pointer stands for an index variable, so it binds to an index, not to a cell:
 * inserting a cell before it leaves it where it was, and an index past the end is drawn off the end.
 */
export const anchorSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cell"), elementId: id, index: z.number().int().min(-MAX_CELLS).max(MAX_CELLS * 2) }),
  z.object({ kind: z.literal("cellAt"), elementId: id, row: z.number().int().min(0).max(MAX_MATRIX), col: z.number().int().min(0).max(MAX_MATRIX) }),
  z.object({ kind: z.literal("entry"), elementId: id, key: value }),
  z.object({ kind: z.literal("node"), elementId: id }),
]);
export type Anchor = z.infer<typeof anchorSchema>;

const point = z.object({ x: coord, y: coord });
/** `x`/`y`: where its name sits. */
export const pointerElementSchema = base.extend({
  type: z.literal("pointer"),
  name: z.string().min(1).max(MAX_POINTER_NAME),
  target: anchorSchema.nullable(),
  /** Where the arrow ends while it points at nothing. */
  end: point.optional(),
});

/**
 * Style, as in Excalidraw's properties panel. Every field is optional, so elements saved before styles existed
 * stay valid; style.ts fills in each type's defaults (which match how those elements always looked). Colours are
 * palette names, not hex, and map to theme variables, so a sketch follows light and dark mode.
 */
export const SKETCH_COLORS = ["ink", "gray", "red", "amber", "green", "brand", "blue", "violet"] as const;
export type SketchColor = (typeof SKETCH_COLORS)[number];
/** Backgrounds: none, the paper itself (hides what's behind), or a pale tint of a palette colour. */
export const FILL_COLORS = ["transparent", "paper", "gray", "red", "amber", "green", "brand", "blue", "violet"] as const;
export type FillColor = (typeof FILL_COLORS)[number];
export const STROKE_WIDTHS = ["thin", "bold", "extraBold"] as const;
export type StrokeWidth = (typeof STROKE_WIDTHS)[number];
export const STROKE_STYLES = ["solid", "dashed", "dotted"] as const;
export type StrokeStyle = (typeof STROKE_STYLES)[number];
/** "hand" is the landing page's handwriting font (Caveat). */
export const FONT_FAMILIES = ["hand", "normal", "code"] as const;
export type FontFamily = (typeof FONT_FAMILIES)[number];
export const FONT_SIZES = ["s", "m", "l", "xl"] as const;
export type FontSize = (typeof FONT_SIZES)[number];
export const FONT_WEIGHTS = ["normal", "bold"] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];
export const TEXT_ALIGNS = ["left", "center", "right"] as const;
export type TextAlign = (typeof TEXT_ALIGNS)[number];
export const ARROWHEADS = ["none", "arrow", "triangle"] as const;
export type Arrowhead = (typeof ARROWHEADS)[number];

const strokeColor = { strokeColor: z.enum(SKETCH_COLORS).optional() };
const stroke = {
  ...strokeColor,
  strokeWidth: z.enum(STROKE_WIDTHS).optional(),
  strokeStyle: z.enum(STROKE_STYLES).optional(),
};
const fill = { fillColor: z.enum(FILL_COLORS).optional() };
const font = {
  fontFamily: z.enum(FONT_FAMILIES).optional(),
  fontSize: z.enum(FONT_SIZES).optional(),
  fontWeight: z.enum(FONT_WEIGHTS).optional(),
  textAlign: z.enum(TEXT_ALIGNS).optional(),
};
/** Percent. */
const opacity = { opacity: z.number().int().min(0).max(100).optional() };

export const noteElementSchema = base.extend({
  type: z.literal("note"),
  text: z.string().max(MAX_TEXT_LENGTH),
  ...strokeColor,
  ...fill,
  ...font,
  ...opacity,
});
/** The sizes text had before `fontSize`; still accepted, and read as the font size when that isn't set. */
export const TEXT_SIZES = ["s", "m", "l"] as const;
export const textElementSchema = base.extend({
  type: z.literal("text"),
  text: z.string().max(MAX_TEXT_LENGTH),
  /** Older text's size. `fontSize` wins; setting a style clears this. */
  size: z.enum(TEXT_SIZES).optional(),
  ...strokeColor,
  ...font,
  ...opacity,
});
export const INK_TONES = ["ink", "blue", "red"] as const;
export type InkTone = (typeof INK_TONES)[number];
export const freehandElementSchema = base.extend({
  type: z.literal("freehand"),
  /** [x, y, pressure], relative to the element's x/y. */
  points: z.array(z.tuple([coord, coord, z.number().min(0).max(1)])).min(1).max(MAX_FREEHAND_POINTS),
  /** The pen it was drawn with; `strokeColor`, when set, wins. */
  tone: z.enum(INK_TONES),
  ...strokeColor,
  strokeWidth: z.enum(STROKE_WIDTHS).optional(),
  ...opacity,
});

export const MIN_SHAPE_SIZE = 8;
export const MAX_SHAPE_SIZE = 4000;
export const MAX_LINE_POINTS = 100;
export const SHAPE_KINDS = ["rectangle", "rounded", "ellipse", "diamond"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];
const dimension = z.number().finite().min(1).max(MAX_SHAPE_SIZE);
/** A free shape with optional text inside it, wrapped to the shape and centred (layout.ts `shapeTextRect`). */
export const shapeElementSchema = base.extend({
  type: z.literal("shape"),
  shape: z.enum(SHAPE_KINDS),
  w: dimension,
  h: dimension,
  text: z.string().max(MAX_TEXT_LENGTH),
  ...stroke,
  ...fill,
  ...font,
  ...opacity,
});
/**
 * A picture from the learner's image library (`SketchImage`, src/lib/sketch/images.ts). The element keeps only the
 * library id, so the file is stored once and served through `imageUrl()`; `alt` is the library name at the time
 * it was placed, for screen readers and the read-out of the sketch. Resizing keeps the picture's proportions
 * unless Shift is held.
 */
export const imageElementSchema = base.extend({
  type: z.literal("image"),
  imageId: z.string().regex(/^[a-f\d]{24}$/i, "Invalid image id"),
  w: dimension,
  h: dimension,
  alt: z.string().max(MAX_IMAGE_NAME_LENGTH).optional(),
  ...opacity,
});

/**
 * An arrow's end attached to another element: the end sits on that element's outline, aimed along the arrow, and
 * follows it when it moves or changes size (bindings.ts).
 */
export const lineBindingSchema = z.object({ elementId: id });
export type LineBinding = z.infer<typeof lineBindingSchema>;

/** A line through two or more points, relative to the element's x/y. An arrow is a line with a head. */
export const lineElementSchema = base.extend({
  type: z.literal("line"),
  points: z.array(z.tuple([coord, coord])).min(2).max(MAX_LINE_POINTS),
  startHead: z.enum(ARROWHEADS).optional(),
  endHead: z.enum(ARROWHEADS).optional(),
  startBinding: lineBindingSchema.nullable().optional(),
  endBinding: lineBindingSchema.nullable().optional(),
  ...stroke,
  ...opacity,
});

export const sketchElementSchema = z.discriminatedUnion("type", [
  arrayElementSchema,
  stackElementSchema,
  queueElementSchema,
  setElementSchema,
  matrixElementSchema,
  hashmapElementSchema,
  variablesElementSchema,
  nodeElementSchema,
  linkElementSchema,
  pointerElementSchema,
  noteElementSchema,
  textElementSchema,
  freehandElementSchema,
  shapeElementSchema,
  imageElementSchema,
  lineElementSchema,
]);

export type SketchElement = z.infer<typeof sketchElementSchema>;
export type SketchElementType = SketchElement["type"];
export type ElementOf<T extends SketchElementType> = Extract<SketchElement, { type: T }>;

/** Structures whose values sit in a row (or a column, for a stack) of cells. */
export type CellsElement = ElementOf<"array" | "stack" | "queue" | "set">;
export type TableElement = ElementOf<"hashmap" | "variables">;
export const CELL_TYPES = ["array", "stack", "queue", "set"] as const;
export const TABLE_TYPES = ["hashmap", "variables"] as const;

export function isCells(el: SketchElement): el is CellsElement {
  return (CELL_TYPES as readonly string[]).includes(el.type);
}
export function isTable(el: SketchElement): el is TableElement {
  return (TABLE_TYPES as readonly string[]).includes(el.type);
}

/** Fields every element carries that only elements.ts sets. */
export type BaseField = "id" | "index" | "version" | "versionNonce" | "updated" | "isDeleted" | "frameId" | "originId";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/** An element before it's placed: no id, order or version yet. */
export type NewElement = DistributiveOmit<SketchElement, BaseField> & { id?: string };

/** What a save sends and the server answers with. */
export const saveSketchSchema = z.object({
  elements: z.array(z.unknown()).max(MAX_STORED_ELEMENTS),
});
