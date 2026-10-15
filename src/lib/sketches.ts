import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { mergeElements } from "@/lib/sketch/elements";
import { parseElements, restoreElements } from "@/lib/sketch/restore";
import {
  MAX_LIVE_ELEMENTS,
  MAX_SKETCH_BYTES,
  MAX_STORED_ELEMENTS,
  SKETCH_SCHEMA_VERSION,
  type SketchElement,
} from "@/lib/sketch/types";
import { Sketch } from "@/models/Sketch";

/** How long a deletion is remembered, so an old tab that saves later can't bring the element back. */
const DELETION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SAVE_TRIES = 4;

export async function loadSketch(userId: string, problemId: Types.ObjectId): Promise<SketchElement[]> {
  await connectDB();
  const doc = await Sketch.findOne({ userId, problemId }).select({ elements: 1 }).lean();
  return doc ? restoreElements(doc.elements).elements : [];
}

/**
 * Merges changed elements into the stored sketch, element by element (the higher version wins, see
 * `supersedes()`), repairs the result and stores it. Answers with the whole sketch, so the caller also picks up
 * what other tabs saved. A save that lost a race with another one is merged again on top of it.
 */
export async function saveSketch(userId: string, problemId: Types.ObjectId, changes: readonly unknown[]): Promise<SketchElement[]> {
  await connectDB();
  const incoming = [...parseElements(changes).elements.values()];

  for (let attempt = 0; attempt < SAVE_TRIES; attempt++) {
    const doc = await Sketch.findOne({ userId, problemId }).select({ elements: 1, rev: 1 }).lean();
    const stored = parseElements(doc?.elements ?? []).elements;
    const { merged } = mergeElements(stored, incoming);
    const elements = prune(restoreElements([...merged.values()]).elements);

    if (elements.filter((el) => !el.isDeleted).length > MAX_LIVE_ELEMENTS) {
      throw new ApiError(413, "sketch_too_large", `A sketch can hold up to ${MAX_LIVE_ELEMENTS} elements.`);
    }
    if (JSON.stringify(elements).length > MAX_SKETCH_BYTES) {
      throw new ApiError(413, "sketch_too_large", "This sketch is too large to save. Remove some drawings or elements.");
    }

    if (!doc) {
      try {
        await Sketch.create({ userId, problemId, schemaVersion: SKETCH_SCHEMA_VERSION, elements, rev: 1 });
        return elements;
      } catch (err) {
        // Another save created it first: merge on top of that one.
        if ((err as { code?: number }).code === 11000) continue;
        throw err;
      }
    }
    const { matchedCount } = await Sketch.updateOne(
      { _id: doc._id, rev: doc.rev },
      { $set: { elements, schemaVersion: SKETCH_SCHEMA_VERSION }, $inc: { rev: 1 } },
    );
    if (matchedCount) return elements;
  }
  throw new ApiError(409, "conflict", "The sketch is being saved from somewhere else. Try again.");
}

/** Forgets deletions older than DELETION_TTL_MS, and the oldest ones beyond MAX_STORED_ELEMENTS. */
function prune(elements: SketchElement[]): SketchElement[] {
  const cutoff = Date.now() - DELETION_TTL_MS;
  let kept = elements.filter((el) => !el.isDeleted || el.updated > cutoff);
  if (kept.length > MAX_STORED_ELEMENTS) {
    const deletions = kept.filter((el) => el.isDeleted).sort((a, b) => a.updated - b.updated);
    const drop = new Set(deletions.slice(0, kept.length - MAX_STORED_ELEMENTS).map((el) => el.id));
    kept = kept.filter((el) => !drop.has(el.id));
  }
  return kept;
}
