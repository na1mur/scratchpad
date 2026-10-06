import { z } from "zod";
import { MAX_TEXT } from "@/lib/schemas/problems";

export const IMAGE_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export const attemptImageSchema = z.object({
  r2Key: z.string().min(1).max(300),
  mimeType: z.enum(IMAGE_MIME_TYPES),
  extractedText: z.string().max(MAX_TEXT).optional(),
});

export const createAttemptSchema = z.object({
  pseudoCode: z
    .string()
    .trim()
    .min(1, "Write your pseudo-code first")
    .max(MAX_TEXT, `Keep the pseudo-code under ${MAX_TEXT.toLocaleString()} characters`),
  idea: z
    .string()
    .trim()
    .max(MAX_TEXT, `Keep the explanation under ${MAX_TEXT.toLocaleString()} characters`)
    .default(""),
  images: z.array(attemptImageSchema).max(4).default([]),
});
export type CreateAttemptInput = z.input<typeof createAttemptSchema>;
