import { z } from "zod";
import { TAGS } from "@/lib/tags";
import { VERDICTS } from "@/lib/verdicts";
import { EVENTS, STRUCTURE_KINDS, TONES } from "./vizSpec";

/**
 * Model-facing schemas. Kept flat and record-free so every provider's
 * structured-output mode can follow them; converted to VizSpec in code.
 */

export const understandingSchema = z.object({
  restatedProblem: z.string().describe("The problem in one or two plain sentences."),
  userApproachInOwnWords: z
    .string()
    .describe("The learner's approach as you understand it, addressed to them ('You're trying to…')."),
  keyInvariantsUserAssumes: z.array(z.string()).describe("Properties the learner's approach relies on."),
  suspectedIssue: z
    .string()
    .describe("Where you suspect the reasoning breaks, or 'none' if it looks correct. Internal only, never shown."),
  chosenTestInput: z.object({
    description: z.string().describe("Human-readable input, e.g. 'nums = [2, 7, 11, 15], target = 9'."),
    argumentsJson: z
      .string()
      .describe('JSON object of named arguments for the function, e.g. {"nums":[2,7,11,15],"target":9}.'),
  }),
  expectedOutput: z.string().describe("The correct output for the chosen input."),
  suggestedTags: z.array(z.enum(TAGS)).max(4),
});
export type Understanding = z.infer<typeof understandingSchema>;

export const structureDeclSchema = z.object({
  id: z.string().describe("Short identifier, e.g. 'nums'."),
  label: z.string(),
  kind: z.enum(STRUCTURE_KINDS),
});

export const translationSchema = z.object({
  codeLines: z
    .array(z.string())
    .describe("The learner's pseudo-code, normalized to one statement per line, keeping their logic and bugs."),
  structures: z.array(structureDeclSchema).min(1).max(6),
  loops: z.array(z.object({ id: z.string(), label: z.string(), line: z.number().int() })),
  program: z.string().describe("JavaScript source defining function run(input). No imports, no async."),
});
export type Translation = z.infer<typeof translationSchema>;

export const narrationSchema = z.object({
  steps: z.array(
    z.object({
      id: z.string(),
      title: z.string().describe("Short, e.g. 'Compare nums[left] + nums[right]'. Max ~8 words."),
      explanation: z.string().describe("1–3 sentences on what happens and why it matters."),
      isBugMoment: z.boolean().describe("True only where the logic first diverges from correct behavior."),
    }),
  ),
});

const wireScalar = z.union([z.string(), z.number(), z.null()]);
const wireValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);

/** One structure snapshot in a flat, record-free shape. */
export const wireStateSchema = z.object({
  structureId: z.string(),
  kind: z.enum(STRUCTURE_KINDS),
  values: z
    .array(wireScalar)
    .optional()
    .describe("array, string (one char per entry), set, stack (bottom first), queue (front first)"),
  entries: z.array(z.object({ key: z.string(), value: wireValue })).optional().describe("hashmap"),
  vars: z.array(z.object({ name: z.string(), value: wireValue })).optional().describe("variables"),
  rows: z.array(z.array(wireScalar)).optional().describe("matrix"),
  nodes: z
    .array(
      z.object({
        id: z.string(),
        value: wireScalar,
        next: z.string().nullable().optional(),
        left: z.string().nullable().optional(),
        right: z.string().nullable().optional(),
        children: z.array(z.string()).optional(),
      }),
    )
    .optional()
    .describe("linkedList (value+next), tree (value+left/right or children), graph (value is the label)"),
  edges: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().optional() })).optional(),
  rootId: z.string().nullable().optional().describe("tree root, or linked list head"),
  directed: z.boolean().optional(),
});
export type WireState = z.infer<typeof wireStateSchema>;

export const simulationSchema = z.object({
  codeLines: z.array(z.string()),
  structures: z.array(structureDeclSchema).min(1).max(6),
  loops: z.array(z.object({ id: z.string(), label: z.string(), line: z.number().int() })),
  steps: z
    .array(
      z.object({
        line: z.number().int().describe("0-based index into codeLines, or -1"),
        loopId: z.string().describe("id of the loop this step is in, or ''"),
        iterationIndex: z.number().int().describe("0-based iteration of that loop, or -1"),
        title: z.string(),
        explanation: z.string(),
        event: z.enum([...EVENTS, "none"]),
        isBugMoment: z.boolean(),
        states: z.array(wireStateSchema).describe("A full snapshot of EVERY structure at this step."),
        pointers: z.array(z.object({ structureId: z.string(), name: z.string(), index: z.union([z.number(), z.string()]) })),
        highlights: z.array(
          z.object({ structureId: z.string(), targets: z.array(z.union([z.number(), z.string()])), tone: z.enum(TONES) }),
        ),
      }),
    )
    .min(1),
  actualOutput: z.string().describe("What the learner's logic actually returns for the test input."),
});
export type Simulation = z.infer<typeof simulationSchema>;

export const diagnosisOutputSchema = z.object({
  understoodApproach: z.string().describe("Addressed to the learner: 'You're trying to…'."),
  verdict: z.enum(VERDICTS),
  actualOutput: z.string(),
  whatGoesWrong: z.string().describe("Empty string if the approach works."),
  whyItGoesWrong: z.string().describe("Empty string if the approach works."),
  bugStepIds: z.array(z.string()),
  failingInputs: z.array(z.string()).max(4),
  thinkingHints: z
    .array(z.string())
    .max(4)
    .describe("Progressive, vague to more specific. Questions and properties to notice. Never the fix."),
});
export type DiagnosisOutput = z.infer<typeof diagnosisOutputSchema>;

export const guardrailSchema = z.object({
  revealsSolution: z.boolean(),
  offendingSentence: z.string().describe("The sentence that gives the solution away, or ''."),
});
