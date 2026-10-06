import { z } from "zod";
import { TAGS } from "@/lib/tags";

export const PAGE_SIZE = 12;
export const MAX_TEXT = 10_000;

const tagsField = z.array(z.enum(TAGS)).max(TAGS.length);

export const createProblemSchema = z.object({
  title: z.string().trim().min(1, "Give the problem a title").max(200, "Keep the title under 200 characters"),
  statement: z
    .string()
    .trim()
    .min(1, "Paste the problem statement")
    .max(MAX_TEXT, `Keep the statement under ${MAX_TEXT.toLocaleString()} characters`),
  tags: tagsField.default([]),
});
export type CreateProblemInput = z.input<typeof createProblemSchema>;

export const updateProblemSchema = createProblemSchema.partial();

export const listProblemsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
  tag: z.enum(TAGS).optional().catch(undefined),
  q: z.string().trim().max(200).optional().catch(undefined),
});
export type ListProblemsQuery = z.infer<typeof listProblemsQuerySchema>;

/** First non-empty line of the statement, trimmed to a title-ish length. */
export function suggestTitle(statement: string): string {
  const first = statement.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  const cleaned = first.replace(/^#+\s*/, "").replace(/^\d+\.\s*/, "");
  return cleaned.length > 80 ? `${cleaned.slice(0, 77).trimEnd()}…` : cleaned;
}
