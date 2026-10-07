import { z } from "zod";
import { VERDICTS } from "@/lib/verdicts";

/**
 * The core contract: AI output is validated against this schema and the
 * renderers consume nothing else. Shared by server and client.
 */

export const MAX_STEPS = 80;
/** Hard ceiling for validation; the prompt asks for MAX_STEPS. */
export const MAX_STEPS_HARD = 120;

export const STRUCTURE_KINDS = [
  "array",
  "string",
  "hashmap",
  "set",
  "stack",
  "queue",
  "linkedList",
  "tree",
  "graph",
  "matrix",
  "variables",
] as const;
export type StructureKind = (typeof STRUCTURE_KINDS)[number];

export const TONES = ["active", "compare", "success", "error", "visited"] as const;
export type Tone = (typeof TONES)[number];

/** Whether the learner's idea is sound but slipping on details, or the strategy itself can't work. */
export const RETHINK_SCOPES = ["fix-the-details", "rethink-the-approach"] as const;
export type RethinkScope = (typeof RETHINK_SCOPES)[number];

export const EVENTS = [
  "init",
  "compare",
  "swap",
  "insert",
  "remove",
  "push",
  "pop",
  "visit",
  "recurse",
  "return",
  "update",
  "output",
] as const;
export type StepEvent = (typeof EVENTS)[number];

const scalar = z.union([z.string(), z.number(), z.null()]);
export type Scalar = z.infer<typeof scalar>;

const primitive = z.union([z.string(), z.number(), z.boolean(), z.null()]);
/** Values shown inside containers: a primitive or a short list of them. */
const displayValue = z.union([primitive, z.array(primitive)]);
export type DisplayValue = z.infer<typeof displayValue>;

const id = z.string().min(1).max(64);

export const arrayStateSchema = z.object({
  kind: z.literal("array"),
  values: z.array(scalar),
  /** Stable per-item ids so swaps and moves animate instead of re-rendering. */
  ids: z.array(z.string()).optional(),
});
export const stringStateSchema = z.object({
  kind: z.literal("string"),
  values: z.array(scalar),
  ids: z.array(z.string()).optional(),
});
export const hashmapStateSchema = z.object({
  kind: z.literal("hashmap"),
  entries: z.array(z.tuple([z.union([z.string(), z.number()]), displayValue])),
});
export const setStateSchema = z.object({
  kind: z.literal("set"),
  values: z.array(primitive),
});
export const stackStateSchema = z.object({
  kind: z.literal("stack"),
  /** Bottom first; the last item is the top. */
  items: z.array(displayValue),
  ids: z.array(z.string()).optional(),
});
export const queueStateSchema = z.object({
  kind: z.literal("queue"),
  /** Front first. */
  items: z.array(displayValue),
  ids: z.array(z.string()).optional(),
});
export const linkedListStateSchema = z.object({
  kind: z.literal("linkedList"),
  nodes: z.array(z.object({ id, value: scalar, next: z.string().nullable() })),
  headId: z.string().nullable().optional(),
});
export const treeStateSchema = z.object({
  kind: z.literal("tree"),
  nodes: z.array(
    z.object({
      id,
      value: scalar,
      left: z.string().nullable().optional(),
      right: z.string().nullable().optional(),
      children: z.array(z.string()).optional(),
    }),
  ),
  rootId: z.string().nullable(),
});
export const graphStateSchema = z.object({
  kind: z.literal("graph"),
  nodes: z.array(z.object({ id, label: z.union([z.string(), z.number()]) })),
  edges: z.array(z.object({ from: z.string(), to: z.string(), weight: z.number().optional() })),
  directed: z.boolean(),
});
export const matrixStateSchema = z.object({
  kind: z.literal("matrix"),
  rows: z.array(z.array(scalar)),
});
export const variablesStateSchema = z.object({
  kind: z.literal("variables"),
  vars: z.record(z.string(), primitive),
});

export const structureStateSchema = z.discriminatedUnion("kind", [
  arrayStateSchema,
  stringStateSchema,
  hashmapStateSchema,
  setStateSchema,
  stackStateSchema,
  queueStateSchema,
  linkedListStateSchema,
  treeStateSchema,
  graphStateSchema,
  matrixStateSchema,
  variablesStateSchema,
]);
export type StructureState = z.infer<typeof structureStateSchema>;
export type StateOf<K extends StructureKind> = Extract<StructureState, { kind: K }>;

/**
 * How pointers and highlights address things: an index for array/string/
 * stack/queue, a node id for linkedList/tree/graph, "row,col" for matrix,
 * a key for hashmap/set/variables.
 */
const target = z.union([z.number(), z.string()]);

export const pointerSchema = z.object({
  structureId: z.string(),
  name: z.string().min(1).max(24),
  index: target,
});
export type Pointer = z.infer<typeof pointerSchema>;

export const highlightSchema = z.object({
  structureId: z.string(),
  targets: z.array(target),
  tone: z.enum(TONES),
});
export type Highlight = z.infer<typeof highlightSchema>;

export const stepSchema = z.object({
  id,
  line: z.number().int().nullable(),
  iteration: z.object({ loopId: z.string(), index: z.number().int().min(0) }).optional(),
  title: z.string().min(1).max(120),
  explanation: z.string().max(600),
  states: z.record(z.string(), structureStateSchema),
  pointers: z.array(pointerSchema).optional(),
  highlights: z.array(highlightSchema).optional(),
  event: z.enum(EVENTS).optional(),
  isBugMoment: z.boolean().optional(),
});
export type Step = z.infer<typeof stepSchema>;

export const structureSchema = z.object({
  id,
  label: z.string().min(1).max(40),
  kind: z.enum(STRUCTURE_KINDS),
});
export type Structure = z.infer<typeof structureSchema>;

export const loopSchema = z.object({ id, label: z.string().min(1).max(40), line: z.number().int() });
export type Loop = z.infer<typeof loopSchema>;

export const summarySchema = z.object({
  understoodApproach: z.string().min(1).max(1200),
  verdict: z.enum(VERDICTS),
  testInputDescription: z.string().min(1).max(600),
  expectedOutput: z.string().max(400),
  actualOutput: z.string().max(400),
});
export type Summary = z.infer<typeof summarySchema>;

export const diagnosisSchema = z.object({
  whatGoesWrong: z.string().max(1500),
  whyItGoesWrong: z.string().max(2000),
  bugStepIds: z.array(z.string()),
  failingInputs: z.array(z.string().max(300)).max(5).optional(),
  /** Progressive: vague first, more specific later. Never the solution. */
  thinkingHints: z.array(z.string().max(500)).max(6),
  /** How to think differently. Absent on specs made before it existed, and when the approach works. */
  rethink: z
    .object({
      scope: z.enum(RETHINK_SCOPES),
      /** The assumption the approach relies on that the problem breaks. */
      brokenAssumption: z.string().max(1500),
      /** What to look at instead, as a question or observation. Never the technique. May be empty if dropped by the guardrail. */
      shiftInThinking: z.string().max(1500),
    })
    .optional(),
});
export type Diagnosis = z.infer<typeof diagnosisSchema>;

const vizSpecBaseSchema = z.object({
  version: z.literal(1),
  summary: summarySchema,
  codeLines: z.array(z.string().max(300)).min(1).max(200),
  /** 0-based indexes of codeLines the pipeline added to make the learner's fragment runnable. */
  addedLines: z.array(z.number().int().min(0)).optional(),
  structures: z.array(structureSchema).min(1).max(8),
  loops: z.array(loopSchema).max(10),
  steps: z.array(stepSchema).min(1).max(MAX_STEPS_HARD),
  diagnosis: diagnosisSchema,
  autoTags: z.array(z.string()).optional(),
});

/** Cross-field rules that a plain shape check can't express. */
export const vizSpecSchema = vizSpecBaseSchema.superRefine((spec, ctx) => {
  const kinds = new Map(spec.structures.map((s) => [s.id, s.kind]));
  if (kinds.size !== spec.structures.length) {
    ctx.addIssue({ code: "custom", path: ["structures"], message: "Structure ids must be unique" });
  }
  spec.addedLines?.forEach((line, i) => {
    if (line >= spec.codeLines.length) {
      ctx.addIssue({ code: "custom", path: ["addedLines", i], message: `line ${line} is outside codeLines` });
    }
  });
  const loopIds = new Set(spec.loops.map((l) => l.id));
  const stepIds = new Set<string>();

  spec.steps.forEach((step, i) => {
    const path = ["steps", i];
    if (stepIds.has(step.id)) ctx.addIssue({ code: "custom", path: [...path, "id"], message: `Duplicate step id "${step.id}"` });
    stepIds.add(step.id);

    if (step.line !== null && (step.line < 0 || step.line >= spec.codeLines.length)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "line"],
        message: `line ${step.line} is outside codeLines (0..${spec.codeLines.length - 1})`,
      });
    }
    if (step.iteration && !loopIds.has(step.iteration.loopId)) {
      ctx.addIssue({ code: "custom", path: [...path, "iteration"], message: `Unknown loopId "${step.iteration.loopId}"` });
    }
    for (const [sid, kind] of kinds) {
      const state = step.states[sid];
      if (!state) {
        ctx.addIssue({ code: "custom", path: [...path, "states"], message: `Missing state for structure "${sid}"` });
      } else if (state.kind !== kind) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "states", sid],
          message: `State kind "${state.kind}" doesn't match structure kind "${kind}"`,
        });
      }
    }
    for (const sid of Object.keys(step.states)) {
      if (!kinds.has(sid)) {
        ctx.addIssue({ code: "custom", path: [...path, "states", sid], message: `Unknown structure "${sid}"` });
      }
    }
    for (const ref of [...(step.pointers ?? []), ...(step.highlights ?? [])]) {
      if (!kinds.has(ref.structureId)) {
        ctx.addIssue({ code: "custom", path, message: `Pointer/highlight references unknown structure "${ref.structureId}"` });
      }
    }
  });

  spec.diagnosis.bugStepIds.forEach((sid, i) => {
    if (!stepIds.has(sid)) {
      ctx.addIssue({ code: "custom", path: ["diagnosis", "bugStepIds", i], message: `Unknown step id "${sid}"` });
    }
  });
});

export type VizSpec = z.infer<typeof vizSpecSchema>;

/** Compact, model-readable list of validation problems for retry prompts. */
export function formatSpecIssues(error: z.ZodError, max = 12): string {
  const lines = error.issues.slice(0, max).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`);
  if (error.issues.length > max) lines.push(`- …and ${error.issues.length - max} more`);
  return lines.join("\n");
}
