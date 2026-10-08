import { z } from "zod";
import { structureDeclSchema } from "./pipeline";

/**
 * Solutions: what the learner sees next to the visualization (shared by
 * server and client), and the model-facing schemas that produce it. The
 * walkthrough itself is a regular VizSpec.
 */

export const SOLUTION_REQUEST_KINDS = ["initial", "different_approach", "better_time", "better_space", "custom"] as const;
export type SolutionRequestKind = (typeof SOLUTION_REQUEST_KINDS)[number];

export const SOLUTION_REQUEST_LABELS: Record<SolutionRequestKind, string> = {
  initial: "Built from your attempt",
  different_approach: "A different approach",
  better_time: "Better time complexity",
  better_space: "Better space complexity",
  custom: "Your request",
};

export const lineNoteSchema = z.object({
  /** 0-based index into codeLines. */
  line: z.number().int().min(0),
  note: z.string().max(600),
});
export type LineNote = z.infer<typeof lineNoteSchema>;

export const solutionContentSchema = z.object({
  name: z.string().min(1).max(120),
  summary: z.string().max(1500),
  /** How this solution relates to the learner's attempt; empty when it isn't built from one. */
  relationToAttempt: z.string().max(1500),
  keyIdeas: z.array(z.string().max(500)).max(6),
  whyItWorks: z.string().max(2000),
  complexity: z.object({
    time: z.string().max(60),
    space: z.string().max(60),
    explanation: z.string().max(1200),
  }),
  codeLines: z.array(z.string().max(300)).min(1).max(200),
  lineNotes: z.array(lineNoteSchema).max(200),
  /** False when the traced run's result didn't match the expected output. */
  verified: z.boolean(),
  /** Web sources the model was given as reference (src/lib/problemReference.ts); absent on older solutions. */
  references: z
    .array(z.object({ title: z.string().max(200), url: z.string().max(2000), license: z.string().max(40).optional() }))
    .max(5)
    .optional(),
});
export type SolutionContent = z.infer<typeof solutionContentSchema>;

// Model-facing ---------------------------------------------------------------

export const solutionPlanSchema = z.object({
  name: z.string().describe("Short name of the approach, e.g. 'Two pointers from both ends'."),
  summary: z.string().describe("2–4 sentences: the idea of the solution, addressed to the learner."),
  relationToAttempt: z
    .string()
    .describe("How this solution relates to the learner's attempt: what carries over and what changed, and why. '' if there's no attempt."),
  keyIdeas: z.array(z.string()).describe("2–5 insights that make the solution work."),
  whyItWorks: z.string().describe("Why it's correct: the invariant or argument, in plain words."),
  timeComplexity: z.string().describe("Big-O time, e.g. 'O(n log n)'."),
  spaceComplexity: z.string().describe("Big-O extra space, e.g. 'O(1)'."),
  complexityExplanation: z.string().describe("1–3 sentences on where the time and space go."),
  codeLines: z.array(z.string()).describe("The full solution, one line per entry, indentation preserved."),
  lineNotes: z
    .array(z.object({ line: z.number().int(), note: z.string() }))
    .describe("One note per meaningful line (0-based line index): what it does and why it's there."),
  testInput: z.object({
    description: z.string().describe("Human-readable input, e.g. 'nums = [2, 7, 11, 15], target = 9'."),
    argumentsJson: z.string().describe('JSON object of named arguments, e.g. {"nums":[2,7,11,15],"target":9}.'),
  }),
  expectedReturnJson: z.string().describe("The exact value the function returns for that input, as JSON, e.g. [0,1]."),
});
export type SolutionPlan = z.infer<typeof solutionPlanSchema>;

export const solutionTranslationSchema = z.object({
  structures: z.array(structureDeclSchema).min(1).max(6),
  loops: z.array(z.object({ id: z.string(), label: z.string(), line: z.number().int() })),
  program: z.string().describe("JavaScript source defining function run(input). No imports, no async."),
});
export type SolutionTranslation = z.infer<typeof solutionTranslationSchema>;
