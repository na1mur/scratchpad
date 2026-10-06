import { z } from "zod";
import { IMAGE_MIME_TYPES } from "@/lib/schemas/attempts";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const EXTENSIONS: Record<(typeof IMAGE_MIME_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const problemId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid problem id");

export const presignSchema = z.object({
  problemId,
  mimeType: z.enum(IMAGE_MIME_TYPES, { error: "Only PNG, JPG or WebP images" }),
  size: z.number().int().positive().max(MAX_IMAGE_BYTES, "Images must be 8 MB or smaller"),
});

export const extractSchema = z.object({
  problemId,
  r2Key: z.string().min(1).max(300),
  mimeType: z.enum(IMAGE_MIME_TYPES),
});

export const extractionOutputSchema = z.object({
  pseudoCode: z
    .string()
    .describe("The handwritten code/pseudo-code exactly as written, one line per line, indentation preserved."),
  notes: z.string().describe("Any prose reasoning or notes on the page, verbatim. Empty if none."),
  legible: z.boolean().describe("False if the image doesn't contain readable code or notes."),
});
