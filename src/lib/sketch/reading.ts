import { z } from "zod";
import { attemptImageSchema } from "@/lib/schemas/attempts";
import { MAX_SKETCH_TEXT } from "@/lib/schemas/uploads";
import { describeElement } from "./describe";
import { elementBounds, type ElementMap } from "./layout";
import type { SketchElement } from "./types";

/**
 * "Draft an attempt" from a sketch: the elements as text for the vision model, and the handoff that carries what
 * it read to the workspace, where it fills the new-attempt draft for the learner to check. Client-safe.
 */

/**
 * Every element in reading order (top to bottom, then left to right) with its top-left corner, from the same
 * descriptions screen readers get. The model reads exact values and text from it and the layout from the picture.
 */
export function sketchOutline(elements: ElementMap, live: readonly SketchElement[]): string {
  const lines = live.flatMap((el) => {
    if (el.type === "freehand") return [];
    const b = elementBounds(el);
    const text = describeElement(elements, el);
    return [{ x: b?.x ?? Infinity, y: b?.y ?? Infinity, text: b ? `(${Math.round(b.x)}, ${Math.round(b.y)}) ${text}` : text }];
  });
  lines.sort((a, b) => a.y - b.y || a.x - b.x);
  return lines
    .map((l) => l.text)
    .join("\n")
    .slice(0, MAX_SKETCH_TEXT);
}

export const sketchReadingSchema = z.object({
  pseudoCode: z.string(),
  idea: z.string(),
  /** The picture, stored like a notebook photo; null when the server has no image storage. */
  image: attemptImageSchema.nullable(),
  /** Where the browser can show that picture. */
  imageUrl: z.string().nullable(),
});
export type SketchReading = z.infer<typeof sketchReadingSchema>;

const storageKey = (problemId: string) => `scratchpad:sketch-reading:${problemId}`;
/** A reading left behind longer than this (the tab was closed and reopened later) isn't applied. */
const MAX_AGE_MS = 30 * 60_000;

/** Kept in memory for the client-side navigation, and in sessionStorage in case the page reloads. */
const pending = new Map<string, { reading: SketchReading; at: number }>();

export function leaveSketchReading(problemId: string, reading: SketchReading) {
  const entry = { reading, at: Date.now() };
  pending.set(problemId, entry);
  try {
    sessionStorage.setItem(storageKey(problemId), JSON.stringify(entry));
  } catch {}
}

/** The reading waiting for this problem's workspace, once: it's removed as it's taken. */
export function takeSketchReading(problemId: string): SketchReading | null {
  let entry: unknown = pending.get(problemId) ?? null;
  pending.delete(problemId);
  try {
    const stored = sessionStorage.getItem(storageKey(problemId));
    sessionStorage.removeItem(storageKey(problemId));
    if (!entry && stored) entry = JSON.parse(stored);
  } catch {}
  const parsed = z.object({ reading: sketchReadingSchema, at: z.number() }).safeParse(entry);
  if (!parsed.success || Date.now() - parsed.data.at > MAX_AGE_MS) return null;
  return parsed.data.reading;
}
