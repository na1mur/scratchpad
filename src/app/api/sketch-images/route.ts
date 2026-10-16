import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, requireUser } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { readImageUpload } from "@/lib/image-upload";
import { deleteKeys, putObject, r2Enabled } from "@/lib/r2";
import { rateLimits } from "@/lib/rateLimit";
import { EXTENSIONS } from "@/lib/schemas/uploads";
import {
  MAX_IMAGE_NAME_LENGTH,
  MAX_LIBRARY_IMAGES,
  MAX_LIBRARY_IMAGE_BYTES,
  MAX_LIBRARY_IMAGE_SIDE,
} from "@/lib/sketch/images";
import { listImages, serializeImage, sketchImageKeyPrefix } from "@/lib/sketchImages";
import { SketchImage } from "@/models/SketchImage";

const fieldsSchema = z.object({
  name: z.string().trim().max(MAX_IMAGE_NAME_LENGTH).optional(),
  width: z.coerce.number().int().min(1).max(MAX_LIBRARY_IMAGE_SIDE),
  height: z.coerce.number().int().min(1).max(MAX_LIBRARY_IMAGE_SIDE),
});

/** The learner's image library, newest first. */
export function GET(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    return NextResponse.json({ images: await listImages(session.userId), limit: MAX_LIBRARY_IMAGES, enabled: r2Enabled });
  });
}

/** Adds the posted picture (`file`, with its pixel `width` and `height`, and an optional `name`) to the library. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const limit = await rateLimits.sketchImages().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many uploads. Try again later.");

    const { form, bytes, type } = await readImageUpload(req, MAX_LIBRARY_IMAGE_BYTES);
    const parsed = fieldsSchema.safeParse({ name: form.get("name") ?? undefined, width: form.get("width"), height: form.get("height") });
    if (!parsed.success) throw new ApiError(400, "validation", "That picture's size couldn't be read.");

    await connectDB();
    if ((await SketchImage.countDocuments({ userId: session.userId })) >= MAX_LIBRARY_IMAGES) {
      throw new ApiError(409, "library_full", `Your library holds up to ${MAX_LIBRARY_IMAGES} images. Delete one to add another.`);
    }

    const key = `${sketchImageKeyPrefix(session.userId)}${randomUUID()}.${EXTENSIONS[type]}`;
    await putObject(key, bytes, type);
    try {
      const doc = await SketchImage.create({
        userId: session.userId,
        name: parsed.data.name || "Image",
        r2Key: key,
        mimeType: type,
        width: parsed.data.width,
        height: parsed.data.height,
        size: bytes.byteLength,
      });
      return NextResponse.json({ image: serializeImage(doc) }, { status: 201 });
    } catch (err) {
      await deleteKeys([key]).catch(() => undefined);
      throw err;
    }
  });
}
