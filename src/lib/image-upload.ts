import "server-only";
import type { NextRequest } from "next/server";
import { ApiError } from "@/lib/api";
import type { IMAGE_MIME_TYPES } from "@/lib/schemas/attempts";

export type ImageType = (typeof IMAGE_MIME_TYPES)[number];

/** The real type from the file's first bytes; the client's claimed type isn't trusted on a public bucket. */
function sniffImageType(b: Uint8Array): ImageType | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to));
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}

/**
 * Reads a multipart request carrying an image in its `file` field. The browser
 * posts the file to us and we put it in R2, so the bucket needs no CORS rules
 * and no presigned URLs. Returns the form too, for any other fields.
 */
export async function readImageUpload(req: NextRequest, maxBytes: number) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) throw new ApiError(400, "validation", "Choose an image to upload.");
  if (file.size > maxBytes) {
    throw new ApiError(400, "validation", `Images must be ${Math.round(maxBytes / 1024 / 1024)} MB or smaller.`);
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const type = sniffImageType(bytes);
  if (!type) throw new ApiError(400, "validation", "Only PNG, JPG or WebP images.");
  return { form, bytes, type };
}
