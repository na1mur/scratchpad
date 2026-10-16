import "server-only";
import { Types } from "mongoose";
import { ApiError } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { deleteKeys } from "@/lib/r2";
import { imageUrl, type LibraryImage } from "@/lib/sketch/images";
import { SketchImage, type SketchImageDoc } from "@/models/SketchImage";

/** Every library picture lives under this prefix, so a key can be checked against its owner. */
export const sketchImageKeyPrefix = (userId: string) => `users/${userId}/sketch-images/`;

export function serializeImage(doc: Pick<SketchImageDoc, "_id" | "name" | "width" | "height" | "size">): LibraryImage {
  const id = String(doc._id);
  return { id, name: doc.name, width: doc.width, height: doc.height, size: doc.size, url: imageUrl(id) };
}

export async function listImages(userId: string): Promise<LibraryImage[]> {
  await connectDB();
  const docs = await SketchImage.find({ userId }).sort({ createdAt: -1 }).lean();
  return docs.map(serializeImage);
}

/** The learner's own picture, or 404 (another learner's id looks the same as a missing one). */
export async function getOwnedImage(userId: string, id: string) {
  if (!Types.ObjectId.isValid(id)) throw new ApiError(404, "not_found", "Image not found.");
  await connectDB();
  const doc = await SketchImage.findOne({ _id: id, userId }).lean();
  if (!doc) throw new ApiError(404, "not_found", "Image not found.");
  return doc;
}

/** Removes the picture from the library and R2. Sketches that still use it show a missing-image box. */
export async function deleteImage(userId: string, id: string) {
  const doc = await getOwnedImage(userId, id);
  await SketchImage.deleteOne({ _id: doc._id, userId });
  // Best effort: an orphaned object is harmless and the database is the source of truth.
  await deleteKeys([doc.r2Key]).catch((err) => console.error("[sketch-images] cleanup failed:", err instanceof Error ? err.message : err));
}
