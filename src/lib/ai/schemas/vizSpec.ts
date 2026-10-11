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
});
export type Summary = z.infer<typeof summarySchema>;

/** The prompts ask for MIN_CASES–MAX_CASES test cases; validation allows up to MAX_CASES_HARD. */
export const MIN_CASES = 3;
export const MAX_CASES = 5;
export const MAX_CASES_HARD = 8;

/** One input the code was run on, with its own walkthrough. */
export const testCaseSchema = z.object({
  id,
  /** Short name for the picker, e.g. "Odd length" or "Empty list". */
  label: z.string().min(1).max(60),
  input: z.string().min(1).max(600),
  expectedOutput: z.string().max(400),
  actualOutput: z.string().max(400),
  /** Whether the run gave the right answer; absent when it couldn't be judged. */
  passed: z.boolean().optional(),
  structures: z.array(structureSchema).min(1).max(8),
  loops: z.array(loopSchema).max(10),
  steps: z.array(stepSchema).min(1).max(MAX_STEPS_HARD),
});
export type TestCase = z.infer<typeof testCaseSchema>;

export const diagnosisSchema = z.object({
  whatGoesWrong: z.string().max(1500),
  whyItGoesWrong: z.string().max(2000),
  /** Step ids from any case; step ids are unique across cases. */
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
  version: z.literal(2),
  summary: summarySchema,
  codeLines: z.array(z.string().max(300)).min(1).max(200),
  /** 0-based indexes of codeLines the pipeline added to make the learner's fragment runnable. */
  addedLines: z.array(z.number().int().min(0)).optional(),
  /** The first case is the one shown by default. */
  cases: z.array(testCaseSchema).min(1).max(MAX_CASES_HARD),
  /** One diagnosis across every case. */
  diagnosis: diagnosisSchema,
  autoTags: z.array(z.string()).optional(),
});

/** Cross-field rules that a plain shape check can't express. */
export const vizSpecSchema = vizSpecBaseSchema.superRefine((spec, ctx) => {
  spec.addedLines?.forEach((line, i) => {
    if (line >= spec.codeLines.length) {
      ctx.addIssue({ code: "custom", path: ["addedLines", i], message: `line ${line} is outside codeLines` });
    }
  });
  const caseIds = new Set<string>();
  const stepIds = new Set<string>();

  spec.cases.forEach((c, ci) => {
    const casePath = ["cases", ci];
    if (caseIds.has(c.id)) ctx.addIssue({ code: "custom", path: [...casePath, "id"], message: `Duplicate case id "${c.id}"` });
    caseIds.add(c.id);
    const kinds = new Map(c.structures.map((s) => [s.id, s.kind]));
    if (kinds.size !== c.structures.length) {
      ctx.addIssue({ code: "custom", path: [...casePath, "structures"], message: "Structure ids must be unique" });
    }
    const loopIds = new Set(c.loops.map((l) => l.id));

    c.steps.forEach((step, i) => {
      const path = [...casePath, "steps", i];
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
  });

  spec.diagnosis.bugStepIds.forEach((sid, i) => {
    if (!stepIds.has(sid)) {
      ctx.addIssue({ code: "custom", path: ["diagnosis", "bugStepIds", i], message: `Unknown step id "${sid}"` });
    }
  });
});

export type VizSpec = z.infer<typeof vizSpecSchema>;

/**
 * One case seen as a single walkthrough: what the player and the panels
 * around it render. `diagnosis.bugStepIds` may name steps of other cases;
 * those simply match no step here.
 */
export type CaseSpec = Pick<VizSpec, "codeLines" | "addedLines" | "diagnosis"> &
  Pick<TestCase, "structures" | "loops" | "steps">;

export function caseView(spec: VizSpec, caseIndex: number): CaseSpec {
  const c = spec.cases[Math.min(Math.max(caseIndex, 0), spec.cases.length - 1)];
  return {
    codeLines: spec.codeLines,
    addedLines: spec.addedLines,
    diagnosis: spec.diagnosis,
    structures: c.structures,
    loops: c.loops,
    steps: c.steps,
  };
}

/** The step the player shows, with both indexes clamped. */
export function stepAt(spec: VizSpec, caseIndex: number, stepIndex: number): Step | undefined {
  const { steps } = caseView(spec, caseIndex);
  return steps[Math.min(Math.max(stepIndex, 0), steps.length - 1)];
}

/** Where a step lives, and how to name it to the learner ("4", or "4 (case 2)" when there are several cases). */
export type StepRef = { id: string; caseIndex: number; index: number; title: string; label: string };

export function stepRefs(spec: VizSpec): Map<string, StepRef> {
  const many = spec.cases.length > 1;
  const out = new Map<string, StepRef>();
  spec.cases.forEach((c, caseIndex) =>
    c.steps.forEach((s, index) =>
      out.set(s.id, {
        id: s.id,
        caseIndex,
        index,
        title: s.title,
        label: many ? `${index + 1} (case ${caseIndex + 1})` : String(index + 1),
      }),
    ),
  );
  return out;
}

/** Specs stored before test cases existed: one input, its walkthrough at the top level. */
export type VizSpecV1 = Pick<VizSpec, "codeLines" | "addedLines" | "diagnosis" | "autoTags"> &
  Pick<TestCase, "structures" | "loops" | "steps"> & {
    version: 1;
    summary: Summary & { testInputDescription: string; expectedOutput: string; actualOutput: string };
  };

/** Reads a stored spec of either version as the current one. */
export function upgradeSpec(spec: VizSpec | VizSpecV1): VizSpec {
  if (spec.version === 2) return spec;
  const { summary, structures, loops, steps, codeLines, addedLines, diagnosis, autoTags } = spec;
  return {
    version: 2,
    codeLines,
    ...(addedLines && { addedLines }),
    diagnosis,
    ...(autoTags && { autoTags }),
    summary: { understoodApproach: summary.understoodApproach, verdict: summary.verdict },
    cases: [
      {
        id: "c1",
        label: "Example",
        input: summary.testInputDescription,
        expectedOutput: summary.expectedOutput,
        actualOutput: summary.actualOutput,
        ...(summary.verdict === "works" && { passed: true }),
        structures,
        loops,
        steps,
      },
    ],
  };
}

/** Compact, model-readable list of validation problems for retry prompts. */
export function formatSpecIssues(error: z.ZodError, max = 12): string {
  const lines = error.issues.slice(0, max).map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`);
  if (error.issues.length > max) lines.push(`- …and ${error.issues.length - max} more`);
  return lines.join("\n");
}
