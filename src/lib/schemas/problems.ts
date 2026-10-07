import { z } from "zod";
import { TAGS } from "@/lib/tags";

export const PAGE_SIZE = 12;
export const MAX_TEXT = 10_000;

const tagsField = z.array(z.enum(TAGS)).max(TAGS.length);

function isHttpUrl(value: string) {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** Optional link back to where the problem came from; "" means none. */
const sourceUrlField = z
  .string()
  .trim()
  .max(2000, "That URL is too long")
  .refine((v) => v === "" || isHttpUrl(v), "Enter a full URL starting with http:// or https://");

const titleField = z.string().trim().min(1, "Give the problem a title").max(200, "Keep the title under 200 characters");
const statementField = z
  .string()
  .trim()
  .min(1, "Paste the problem statement")
  .max(MAX_TEXT, `Keep the statement under ${MAX_TEXT.toLocaleString()} characters`);

/** The title is generated server-side from the statement. */
export const createProblemSchema = z.object({
  statement: statementField,
  tags: tagsField.default([]),
  sourceUrl: sourceUrlField.default(""),
});
export type CreateProblemInput = z.input<typeof createProblemSchema>;

/** Edit dialog form: every field is present, the title is required. */
export const editProblemSchema = z.object({
  title: titleField,
  statement: statementField,
  tags: tagsField.default([]),
  sourceUrl: sourceUrlField.default(""),
});
export type EditProblemInput = z.input<typeof editProblemSchema>;

/** PATCH body: no defaults, so omitted fields stay untouched. */
export const updateProblemSchema = z
  .object({ title: titleField, statement: statementField, tags: tagsField, sourceUrl: sourceUrlField })
  .partial();

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
