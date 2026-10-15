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

/** The sketch's elements as text, sent along with its picture (`sketchOutline()`). */
export const MAX_SKETCH_TEXT = 12_000;

export const sketchReadingOutputSchema = z.object({
  pseudoCode: z
    .string()
    .describe(
      "Only code or step-by-step pseudo-code the learner wrote on the canvas (text, notes, labels in shapes), verbatim, one line per line, indentation preserved. Empty if they wrote none; never code made up from the drawing.",
    ),
  idea: z
    .string()
    .describe(
      "Plain words for what the drawing shows, in the order it reads: each structure and its values, where each pointer points, what each variable holds, and what changes from one drawn state to the next. Prose notes go here, quoted as written. Only what is drawn.",
    ),
  readable: z.boolean().describe("False if the picture has nothing drawn or written that can be read."),
});
