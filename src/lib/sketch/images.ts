import { MAX_IMAGE_NAME_LENGTH } from "./types";

/**
 * The learner's personal image library for the sketch canvas: pictures uploaded once (kept in R2, listed in the
 * `SketchImage` collection) and dropped onto any sketch as `image` elements. Safe to import on the client.
 */

/** How many pictures a learner can keep. */
export const MAX_LIBRARY_IMAGES = 60;
export const MAX_LIBRARY_IMAGE_BYTES = 4 * 1024 * 1024;
/** Longest side, in pixels, of a picture we accept. */
export const MAX_LIBRARY_IMAGE_SIDE = 8000;
export const LIBRARY_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export { MAX_IMAGE_NAME_LENGTH };

/** A library picture as the client sees it. `url` is where the file is served (checked against the session). */
export type LibraryImage = {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number;
  url: string;
};

export const imageUrl = (id: string) => `/api/sketch-images/${id}/file`;

/** The size a picture gets when it's first placed: its own size, shrunk to fit a box of `max` units. */
export function placedSize(width: number, height: number, max = 320): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(width, height, 1));
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

/** A library name from a file name: no extension, trimmed, never empty. */
export function nameFromFile(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return (base || "Image").slice(0, MAX_IMAGE_NAME_LENGTH);
}
