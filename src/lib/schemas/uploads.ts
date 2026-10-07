import { z } from "zod";
import { IMAGE_MIME_TYPES } from "@/lib/schemas/attempts";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export const EXTENSIONS: Record<(typeof IMAGE_MIME_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

const problemId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid problem id");

export const extractSchema = z.object({
  problemId,
  r2Key: z.string().min(1).max(300),
  mimeType: z.enum(IMAGE_MIME_TYPES),
});

export const extractionOutputSchema = z.object({
  pseudoCode: z
    .string()
    .describe(
      "Only the handwritten code/pseudo-code, exactly as written, one line per line, indentation preserved. Empty if the page has no code.",
    ),
  notes: z
    .string()
    .describe(
      "The idea or explanation: prose reasoning, observations and hand-worked examples, verbatim and not repeated from pseudoCode. Empty if none.",
    ),
  legible: z.boolean().describe("False if the image doesn't contain readable code or notes."),
});
