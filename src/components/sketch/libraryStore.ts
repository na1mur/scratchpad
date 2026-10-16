"use client";

import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { api, ApiClientError, apiRaw, toApiError } from "@/lib/fetcher";
import {
  LIBRARY_IMAGE_TYPES,
  MAX_LIBRARY_IMAGES,
  MAX_LIBRARY_IMAGE_BYTES,
  MAX_LIBRARY_IMAGE_SIDE,
  nameFromFile,
  placedSize,
  type LibraryImage,
} from "@/lib/sketch/images";
import type { Point } from "@/lib/sketch/layout";
import { insertElements } from "./commands";
import type { SketchStore } from "./store";

/** The drag type of a library picture, so the canvas only accepts its own items. */
export const LIBRARY_IMAGE_MIME = "application/x-scratchpad-sketch-image";

/**
 * The learner's image library: one list for the whole app (it isn't tied to a problem), loaded once and kept here
 * so the sidebar and the canvas (which takes files dropped on it) share it.
 */
export type LibraryState = {
  images: LibraryImage[];
  status: "idle" | "loading" | "ready" | "error";
  /** False when the server has no file storage, so nothing can be uploaded. */
  enabled: boolean;
  /** How many files are on their way up. */
  uploading: number;
  limit: number;
};

let state: LibraryState = { images: [], status: "idle", enabled: true, uploading: 0, limit: MAX_LIBRARY_IMAGES };
const listeners = new Set<() => void>();

function set(patch: Partial<LibraryState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useImageLibrary(): LibraryState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

export const libraryImage = (id: string): LibraryImage | undefined => state.images.find((i) => i.id === id);

export async function loadLibrary(force = false) {
  if (!force && (state.status === "loading" || state.status === "ready")) return;
  set({ status: "loading" });
  try {
    const res = await api<{ images: LibraryImage[]; limit: number; enabled: boolean }>("/api/sketch-images");
    set({ images: res.images, limit: res.limit, enabled: res.enabled, status: "ready" });
  } catch {
    set({ status: "error" });
  }
}

/** The picture's pixel size, read by the browser (which is how the server learns it too). */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("That file isn't a picture the browser can read."));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

/** Why a file can't be added, or null. */
function refusal(file: File): string | null {
  if (!(LIBRARY_IMAGE_TYPES as readonly string[]).includes(file.type)) return `${file.name}: only PNG, JPG or WebP pictures.`;
  if (file.size > MAX_LIBRARY_IMAGE_BYTES) return `${file.name}: pictures must be ${MAX_LIBRARY_IMAGE_BYTES / 1024 / 1024} MB or smaller.`;
  return null;
}

/** Uploads pictures to the library, one at a time; resolves to the ones that were added. Reports problems with toasts. */
export async function uploadImages(files: readonly File[]): Promise<LibraryImage[]> {
  const added: LibraryImage[] = [];
  for (const file of files) {
    const why = refusal(file);
    if (why) {
      toast.error(why);
      continue;
    }
    if (state.images.length + added.length >= state.limit) {
      toast.error(`Your library holds up to ${state.limit} images. Delete one to add another.`);
      break;
    }
    set({ uploading: state.uploading + 1 });
    try {
      const { width, height } = await measure(file);
      if (Math.max(width, height) > MAX_LIBRARY_IMAGE_SIDE) throw new Error(`${file.name}: the longest side can be ${MAX_LIBRARY_IMAGE_SIDE} pixels.`);
      const form = new FormData();
      form.set("file", file);
      form.set("name", nameFromFile(file.name));
      form.set("width", String(width));
      form.set("height", String(height));
      const res = await apiRaw("/api/sketch-images", { method: "POST", body: form });
      if (!res.ok) throw await toApiError(res);
      const { image } = (await res.json()) as { image: LibraryImage };
      added.push(image);
      set({ images: [image, ...state.images] });
    } catch (err) {
      toast.error(err instanceof ApiClientError || err instanceof Error ? err.message : "The picture couldn't be uploaded.");
    } finally {
      set({ uploading: state.uploading - 1 });
    }
  }
  return added;
}

export async function removeImage(id: string): Promise<boolean> {
  try {
    await api(`/api/sketch-images/${id}`, { method: "DELETE" });
    set({ images: state.images.filter((i) => i.id !== id) });
    return true;
  } catch (err) {
    toast.error(err instanceof Error ? err.message : "The picture couldn't be deleted.");
    return false;
  }
}

/**
 * Puts a library picture on the canvas as one undoable change: at the middle of the view, or centred on `at`.
 */
export function placeImage(store: SketchStore, image: LibraryImage, at?: Point) {
  const { w, h } = placedSize(image.width, image.height);
  insertElements(
    store,
    [{ type: "image", x: 0, y: 0, w, h, imageId: image.id, alt: image.name }],
    at && { x: at.x - w / 2, y: at.y - h / 2 },
  );
}
