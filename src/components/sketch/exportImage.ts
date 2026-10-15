"use client";

import { flushSync } from "react-dom";
import { domToBlob } from "modern-screenshot";
import { MAX_IMAGE_BYTES } from "@/lib/schemas/uploads";
import { elementBounds, linkSegment, pointerSegment, unionRect, type ElementMap, type Rect } from "@/lib/sketch/layout";
import type { SketchElement } from "@/lib/sketch/types";
import type { SketchStore } from "./store";

/**
 * Pictures of the sketch, for "Export PNG" and for reading the sketch into an attempt. The canvas's scene layer
 * (`data-sketch-scene`) is copied with the camera reset to 100% and moved so the content sits at the padding,
 * then drawn by modern-screenshot, which inlines the computed styles (so theme colours, the fonts and the SVG
 * arrows come out as on screen). Anything marked `data-export-skip` (selection outlines, handles, toolbars) is
 * left out.
 */

/** The graph paper, the plain paper colour, or nothing (a transparent PNG). */
export type Backdrop = "grid" | "plain" | "none";

export type CaptureOptions = {
  /** Only these elements; the whole sketch when absent. */
  only?: ReadonlySet<string>;
  backdrop: Backdrop;
  /** "light" draws in the light theme whatever the page uses, for the vision model. */
  theme: "page" | "light";
  /** Image pixels per scene unit. */
  scale: number;
  /** The longest side of the image in pixels; the scale is lowered to fit. */
  maxSide?: number;
};

const PADDING = 32;
/** The canvas's graph-paper square at 100%. */
const GRID_SQUARE = 32;
/** Browsers refuse canvases much larger than this on a side. */
const MAX_CANVAS_SIDE = 16_000;

/** Everything drawn, arrows included (a pointer's free end or a null link can reach past the boxes). */
export function contentBounds(elements: ElementMap, live: readonly SketchElement[], only?: ReadonlySet<string>): Rect | null {
  const rects: Rect[] = [];
  for (const el of live) {
    if (only && !only.has(el.id)) continue;
    const b = elementBounds(el);
    if (b) rects.push(b);
    const seg = el.type === "link" ? linkSegment(elements, el) : el.type === "pointer" ? pointerSegment(elements, el) : null;
    if (seg) {
      const x = Math.min(seg.from.x, seg.to.x);
      const y = Math.min(seg.from.y, seg.to.y);
      // Room for an arrowhead or the "null" after a link.
      rects.push({ x: x - 12, y: y - 12, w: Math.abs(seg.to.x - seg.from.x) + 40, h: Math.abs(seg.to.y - seg.from.y) + 24 });
    }
  }
  return unionRect(rects);
}

/**
 * The light theme's custom properties, read from the `:root` rules of the page's stylesheets. Set on the copy's
 * container they win over the dark values it would otherwise inherit from `<html class="dark">`.
 */
function lightVariables(): [string, string][] {
  const found = new Map<string, string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (!rule.selectorText.split(",").some((s) => s.trim() === ":root")) continue;
        for (const prop of Array.from(rule.style)) {
          if (prop.startsWith("--")) found.set(prop, rule.style.getPropertyValue(prop));
        }
      } else if ("cssRules" in rule) {
        visit((rule as CSSGroupingRule).cssRules);
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      visit(sheet.cssRules);
    } catch {
      // A stylesheet from another origin can't be read; ours are all same-origin.
    }
  }
  return [...found];
}

/**
 * A copy of the scene as it's drawn, without the selection. The selection is cleared for one synchronous render
 * so its outlines and handles (some of them drawn inside the arrows' SVG) aren't in the copy, then put back.
 */
function cloneScene(store: SketchStore): HTMLElement {
  const scene = document.querySelector<HTMLElement>("[data-sketch-scene]");
  if (!scene) throw new Error("The canvas isn't on the page.");
  const { selection, activeCell } = store.state;
  flushSync(() => {
    store.setEditing(null);
    store.setOverlay(null);
    store.select([]);
  });
  try {
    return scene.cloneNode(true) as HTMLElement;
  } finally {
    store.select(selection);
    if (activeCell) store.setActiveCell(activeCell);
  }
}

/** Draws the sketch (or part of it) to a PNG. Null when there's nothing to draw. */
export async function captureSketch(store: SketchStore, opts: CaptureOptions): Promise<Blob | null> {
  const { elements, live } = store.state;
  const rect = contentBounds(elements, live, opts.only);
  if (!rect) return null;
  const width = Math.ceil(rect.w + PADDING * 2);
  const height = Math.ceil(rect.h + PADDING * 2);
  const scale = Math.min(opts.scale, (opts.maxSide ?? MAX_CANVAS_SIDE) / Math.max(width, height), MAX_CANVAS_SIDE / Math.max(width, height));

  const copy = cloneScene(store);
  for (const node of copy.querySelectorAll("[data-export-skip]")) node.remove();
  if (opts.only) {
    for (const node of copy.querySelectorAll("[data-el]")) {
      if (!opts.only.has(node.getAttribute("data-el")!)) node.remove();
    }
  }
  copy.style.transform = `translate(${PADDING - rect.x}px, ${PADDING - rect.y}px)`;
  copy.style.transformOrigin = "0 0";

  // Laid out inside a zero-size clipped wrapper, so it's styled like the original without showing. It can't sit
  // far off-screen instead: modern-screenshot then draws nothing and the PNG comes out fully transparent.
  const wrapper = document.createElement("div");
  wrapper.setAttribute("aria-hidden", "true");
  Object.assign(wrapper.style, { position: "fixed", left: "0", top: "0", width: "0", height: "0", overflow: "hidden", pointerEvents: "none" });
  const host = document.createElement("div");
  Object.assign(host.style, { width: `${width}px`, height: `${height}px`, overflow: "hidden" });
  if (opts.theme === "light" && document.documentElement.classList.contains("dark")) {
    for (const [prop, value] of lightVariables()) host.style.setProperty(prop, value);
    host.style.colorScheme = "light";
  }
  // Inherited colour and font were worked out on <body>; worked out again here they follow the theme above.
  host.style.color = "var(--foreground)";
  host.style.fontFamily = "var(--font-sans)";
  if (opts.backdrop !== "none") host.style.backgroundColor = "var(--paper)";
  if (opts.backdrop === "grid") {
    // The same paper as the canvas, with its lines on the same scene coordinates.
    host.className = "bg-graph-subtle";
    host.style.backgroundSize = `${GRID_SQUARE}px ${GRID_SQUARE}px`;
    host.style.backgroundPosition = `${PADDING - rect.x}px ${PADDING - rect.y}px`;
  }
  host.append(copy);
  wrapper.append(host);
  document.body.append(wrapper);
  try {
    await document.fonts.ready;
    return await domToBlob(host, {
      width,
      height,
      scale,
      backgroundColor: null,
      filter: (node) => !(node instanceof Element && node.hasAttribute("data-export-skip")),
    });
  } finally {
    wrapper.remove();
  }
}

/**
 * The whole sketch for the vision model: light theme on plain paper (dark text on light reads best), no wider
 * than it needs to be, and under the upload limit, shrinking until it fits.
 */
export async function captureForReading(store: SketchStore): Promise<Blob | null> {
  let maxSide = 2048;
  for (let i = 0; i < 4; i++) {
    const blob = await captureSketch(store, { backdrop: "plain", theme: "light", scale: 2, maxSide });
    if (!blob || blob.size <= MAX_IMAGE_BYTES) return blob;
    maxSide = Math.round(maxSide * 0.6);
  }
  throw new Error("The sketch is too large to read in one picture.");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers start the download after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
