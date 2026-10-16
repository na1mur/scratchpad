import { withChanges } from "./elements";
import type {
  Arrowhead,
  ElementOf,
  FillColor,
  FontFamily,
  FontSize,
  FontWeight,
  InkTone,
  SketchColor,
  SketchElement,
  StrokeStyle,
  StrokeWidth,
  TextAlign,
} from "./types";

/**
 * Element styles: which properties each element type takes, their defaults, and how they draw. Defaults match
 * how text, notes and drawings looked before styles existed, so an element without style fields is unchanged.
 * Colours resolve to CSS variables (globals.css), never hex, so the canvas follows the theme. Safe on the client.
 */

export type Style = {
  strokeColor: SketchColor;
  fillColor: FillColor;
  strokeWidth: StrokeWidth;
  strokeStyle: StrokeStyle;
  fontFamily: FontFamily;
  fontSize: FontSize;
  fontWeight: FontWeight;
  textAlign: TextAlign;
  opacity: number;
  startHead: Arrowhead;
  endHead: Arrowhead;
  /** Rectangles only: whether the corners are rounded (the `shape` kind "rounded"). */
  edges: "sharp" | "round";
};
export type StyleKey = keyof Style;
export type StylePatch = Partial<Style>;

export type StyledElement = ElementOf<"shape" | "image" | "line" | "text" | "note" | "freehand">;
export type StyledType = StyledElement["type"];

/** The properties each type takes, in the order the style panel lists them. */
export const STYLE_KEYS: Record<StyledType, readonly StyleKey[]> = {
  shape: ["strokeColor", "fillColor", "strokeWidth", "strokeStyle", "edges", "fontFamily", "fontSize", "fontWeight", "textAlign", "opacity"],
  line: ["strokeColor", "strokeWidth", "strokeStyle", "startHead", "endHead", "opacity"],
  text: ["strokeColor", "fontFamily", "fontSize", "fontWeight", "textAlign", "opacity"],
  note: ["strokeColor", "fillColor", "fontFamily", "fontSize", "fontWeight", "textAlign", "opacity"],
  freehand: ["strokeColor", "strokeWidth", "opacity"],
  image: ["opacity"],
};

export function isStyled(el: SketchElement): el is StyledElement {
  return el.type in STYLE_KEYS;
}

/** Whether `key` applies to this element (edges only to rectangles). */
export function takesStyle(el: StyledElement, key: StyleKey): boolean {
  if (key === "edges") return el.type === "shape" && (el.shape === "rectangle" || el.shape === "rounded");
  return STYLE_KEYS[el.type].includes(key);
}

const BASE: Style = {
  strokeColor: "ink",
  fillColor: "transparent",
  strokeWidth: "bold",
  strokeStyle: "solid",
  fontFamily: "hand",
  fontSize: "m",
  fontWeight: "normal",
  textAlign: "center",
  opacity: 100,
  startHead: "none",
  endHead: "none",
  edges: "sharp",
};

/** What a new shape, line or arrow starts with until the learner picks something else. Lines take no heads. */
export const DEFAULT_NEW_STYLE: Style = { ...BASE, endHead: "arrow" };

const TONE_COLOR: Record<InkTone, SketchColor> = { ink: "ink", blue: "blue", red: "red" };

/** Every property resolved: the element's own value, or its type's default. */
export function styleOf(el: StyledElement): Style {
  const o = el.opacity ?? 100;
  switch (el.type) {
    case "shape":
      return {
        ...BASE,
        strokeColor: el.strokeColor ?? "ink",
        fillColor: el.fillColor ?? "transparent",
        strokeWidth: el.strokeWidth ?? "bold",
        strokeStyle: el.strokeStyle ?? "solid",
        fontFamily: el.fontFamily ?? "hand",
        fontSize: el.fontSize ?? "m",
        fontWeight: el.fontWeight ?? "normal",
        textAlign: el.textAlign ?? "center",
        opacity: o,
        edges: el.shape === "rounded" ? "round" : "sharp",
      };
    case "line":
      return {
        ...BASE,
        strokeColor: el.strokeColor ?? "ink",
        strokeWidth: el.strokeWidth ?? "bold",
        strokeStyle: el.strokeStyle ?? "solid",
        startHead: el.startHead ?? "none",
        endHead: el.endHead ?? "none",
        opacity: o,
      };
    case "text":
      return {
        ...BASE,
        strokeColor: el.strokeColor ?? "ink",
        fontFamily: el.fontFamily ?? "code",
        fontSize: el.fontSize ?? el.size ?? "m",
        fontWeight: el.fontWeight ?? "normal",
        textAlign: el.textAlign ?? "left",
        opacity: o,
      };
    case "note":
      return {
        ...BASE,
        strokeColor: el.strokeColor ?? "ink",
        fillColor: el.fillColor ?? "brand",
        fontFamily: el.fontFamily ?? "normal",
        // Notes were 13px; "s" stands for that until a size is picked.
        fontSize: el.fontSize ?? "s",
        fontWeight: el.fontWeight ?? "normal",
        textAlign: el.textAlign ?? "left",
        opacity: o,
      };
    case "image":
      return { ...BASE, opacity: o };
    case "freehand":
      return { ...BASE, strokeColor: el.strokeColor ?? TONE_COLOR[el.tone], strokeWidth: el.strokeWidth ?? "bold", opacity: o };
  }
}

/** The fields a new element of this type gets from `style` (what the shape tools remember). */
export function styleFields(type: "shape" | "line", style: Style) {
  const stroke = { strokeColor: style.strokeColor, strokeWidth: style.strokeWidth, strokeStyle: style.strokeStyle, opacity: style.opacity };
  if (type === "line") return stroke;
  return {
    ...stroke,
    fillColor: style.fillColor,
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    textAlign: style.textAlign,
  };
}

/**
 * The element with `patch` applied where it takes those properties, or null when nothing changes. Edges switch a
 * rectangle between sharp and rounded; setting a font size on older text drops its `size`.
 */
export function applyStyle(el: StyledElement, patch: StylePatch): StyledElement | null {
  const current = styleOf(el);
  const changes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch) as [StyleKey, Style[StyleKey]][]) {
    if (value === undefined || !takesStyle(el, key) || current[key] === value) continue;
    if (key === "edges") changes.shape = value === "round" ? "rounded" : "rectangle";
    else changes[key] = value;
  }
  if (el.type === "text" && "fontSize" in changes) changes.size = undefined;
  if (!Object.keys(changes).length) return null;
  return withChanges(el, changes as Partial<StyledElement>) as StyledElement;
}

// Drawing

const COLOR_VAR: Record<SketchColor, string> = {
  ink: "var(--ink)",
  gray: "var(--sketch-gray)",
  red: "var(--pen-red)",
  amber: "var(--sketch-amber)",
  green: "var(--sketch-green)",
  brand: "var(--brand-strong)",
  blue: "var(--pen-blue)",
  violet: "var(--sketch-violet)",
};

/** A palette colour as CSS, for strokes, text and swatches. */
export function colorCss(c: SketchColor): string {
  return COLOR_VAR[c];
}

/** A background as CSS: an opaque tint mixed into the paper, so it reads in both themes. */
export function fillCss(c: FillColor): string {
  if (c === "transparent") return "transparent";
  if (c === "paper") return "var(--paper)";
  if (c === "brand") return "color-mix(in oklab, var(--brand) 45%, var(--paper))";
  return `color-mix(in oklab, ${COLOR_VAR[c]} 20%, var(--paper))`;
}

export const STROKE_PX: Record<StrokeWidth, number> = { thin: 1, bold: 2, extraBold: 4 };
/** Freehand strokes are filled outlines, so their widths are a little larger. */
export const FREEHAND_PX: Record<StrokeWidth, number> = { thin: 2.5, bold: 4, extraBold: 7 };

/** SVG dash pattern for a stroke style at a width (Excalidraw's proportions). */
export function dashArray(style: StrokeStyle, width: number): string | undefined {
  if (style === "dashed") return `${8 + width} ${8 + width}`;
  if (style === "dotted") return `${0.01} ${6 + width * 2}`;
  return undefined;
}

export const FONT_CSS: Record<FontFamily, string> = {
  hand: "var(--font-caveat), cursive",
  normal: "var(--font-geist-sans), ui-sans-serif, sans-serif",
  code: "var(--font-geist-mono), ui-monospace, monospace",
};

/** Text's old s/m/l sizes keep their pixels. */
export const FONT_SIZE_PX: Record<FontSize, number> = { s: 14, m: 18, l: 26, xl: 36 };

/** Average glyph width as a share of the font size, for sizing text without measuring it. Errs wide. */
export const CHAR_WIDTH: Record<FontFamily, number> = { hand: 0.46, normal: 0.56, code: 0.6 };

export const COLOR_LABELS: Record<SketchColor | FillColor, string> = {
  ink: "Ink",
  gray: "Grey",
  red: "Red",
  amber: "Amber",
  green: "Green",
  brand: "Mint",
  blue: "Blue",
  violet: "Violet",
  transparent: "None",
  paper: "Paper",
};
