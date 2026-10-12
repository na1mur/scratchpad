import { z } from "zod";
import { SOLUTION_REQUEST_KINDS } from "@/lib/ai/schemas/solution";

export const MAX_SOLUTION_NOTE = 500;

export const createSolutionSchema = z
  .object({
    kind: z.enum(SOLUTION_REQUEST_KINDS),
    note: z
      .string()
      .trim()
      .max(MAX_SOLUTION_NOTE, `Keep it under ${MAX_SOLUTION_NOTE} characters`)
      .default(""),
    /** The attempt the solution builds on: required for `from_attempt`; `initial` defaults to the newest analysed one. */
    attemptId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  })
  .refine((v) => v.kind !== "custom" || v.note.length > 0, { path: ["note"], message: "Say what you'd like to see" })
  .refine((v) => v.kind !== "from_attempt" || v.attemptId, { path: ["attemptId"], message: "Pick the attempt to fix" });
export type CreateSolutionInput = z.input<typeof createSolutionSchema>;
