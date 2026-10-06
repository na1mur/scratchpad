import { z } from "zod";

export const MAX_MESSAGE = 2_000;

export const sendMessageSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Ask something")
    .max(MAX_MESSAGE, `Keep questions under ${MAX_MESSAGE.toLocaleString()} characters`),
  focusStepIds: z.array(z.string().max(64)).max(8).default([]),
  /** Which spec version the learner is looking at (1-based). */
  specVersion: z.number().int().min(1).optional(),
});
export type SendMessageInput = z.input<typeof sendMessageSchema>;
