import "server-only";
import type { LanguageModel } from "ai";
import { baseInstructions, learnerContext, referenceBlock } from "@/lib/ai/prompts/system";
import {
  DIAGNOSE_ROLE,
  GUARDRAIL_ROLE,
  NARRATE_ROLE,
  SIMULATE_ROLE,
  STRICTER_ADDENDUM,
  TRANSLATE_ROLE,
  UNDERSTAND_FIXED_ROLE,
  UNDERSTAND_ROLE,
} from "@/lib/ai/prompts/pipeline";
import {
  diagnosisOutputSchema,
  guardrailSchema,
  narrationSchema,
  simulationSchema,
  translationSchema,
  understandingCoreSchema,
  understandingSchema,
  type DiagnosisOutput,
  type Simulation,
  type Translation,
  type Understanding,
  type WireState,
} from "@/lib/ai/schemas/pipeline";
import {
  MAX_CASES_HARD,
  MIN_CASES,
  formatSpecIssues,
  structureStateSchema,
  vizSpecSchema,
  type Loop,
  type Step,
  type Structure,
  type StructureState,
  type TestCase,
  type VizSpec,
} from "@/lib/ai/schemas/vizSpec";
import { answerType as harnessAnswer, describeArgs, sameAnswer, signatureText, type ReadyHarness, type ValueType } from "@/lib/harness/types";
import { PipelineError, generateStructured, type UsageMeter } from "./llm";
import type { ProgressTracker } from "./progress";
import { instrumentJs, markerLines, parseProgram } from "@/lib/trace/instrument";
import { autoSteps, isAutoEvent, type ShowDecl } from "@/lib/trace/steps";
import { runInSandbox, type SandboxResult } from "./sandbox";
import { collapseSteps, describeSteps } from "./steps";

/** `source` is the linked page's text (src/lib/problemSource.ts), "" if there's none. */
export type LearnerInput = { statement: string; source?: string; pseudoCode: string; idea: string; language: string };

/**
 * `reference` is known solutions from the web (src/lib/problemReference.ts), "" if none were found. Only
 * understand and diagnose see it: they need to know what correct looks like, the tracing stages don't.
 */
export type Ctx = {
  model: LanguageModel;
  meter: UsageMeter;
  learner: LearnerInput;
  reference?: string;
  /** Fires when the learner stops the run. */
  signal?: AbortSignal;
  /** Partial output shown while the run works; absent for runs nobody watches (regenerations). */
  progress?: ProgressTracker;
  /** The problem's harness, when it's ready: the run uses its fixed cases and checks answers in code. */
  harness?: ReadyHarness;
};

function withReference(ctx: Ctx) {
  const block = referenceBlock(ctx.reference);
  return block ? `\n\n${block}` : "";
}

/** Steering from a follow-up question when regenerating a visualization. */
export type Guidance = { reason: string; focus?: string; newTestInput?: string };

/** A test case as the pipeline carries it. `expected` is the correct answer, in words or JSON. */
export type PipelineCase = { id: string; label: string; description: string; args: Record<string, unknown>; expected: string };

/** One case's run. Step ids carry the case id ("c2-s5"), so they're unique across cases. */
export type CaseTrace = PipelineCase & {
  mode: "execution" | "simulation";
  structures: Structure[];
  loops: Loop[];
  steps: Step[];
  actualOutput: string;
  /** How the run ended, for the diagnosis ("never terminated", "crashed"). */
  runNote: string | null;
  /** Whether the run's answer matched the expected one, checked in code; absent when that can't be told. */
  passed?: boolean;
};

export type TraceResult = {
  /** "execution" only when every case ran in the sandbox. */
  mode: "execution" | "simulation";
  codeLines: string[];
  addedLines: number[];
  cases: CaseTrace[];
};

const instr = (ctx: Ctx, role: string) => baseInstructions(ctx.learner.language, role);

function guidanceBlock(g?: Guidance) {
  if (!g) return "";
  return `\n\n<regeneration_request>\nThe learner asked for a new visualization. Reason: ${g.reason}${
    g.focus ? `\nFocus on: ${g.focus}` : ""
  }${g.newTestInput ? `\nMake this input the first test case: ${g.newTestInput}` : ""}\n</regeneration_request>`;
}

// Stage 1 ---------------------------------------------------------------

/** Understandings stored before test cases existed have a single `chosenTestInput` instead. */
export function hasTestCases(u: unknown): u is Understanding {
  return Boolean(u && typeof u === "object" && Array.isArray((u as Understanding).testCases));
}

function parseArgs(json: string): Record<string, unknown> | null {
  try {
    const args = JSON.parse(json);
    return args && typeof args === "object" && !Array.isArray(args) ? args : null;
  } catch {
    return null;
  }
}

export function casesOf(u: Understanding): PipelineCase[] {
  return u.testCases.slice(0, MAX_CASES_HARD).map((c, i) => ({
    id: `c${i + 1}`,
    label: c.label.trim() || `Case ${i + 1}`,
    description: c.description,
    args: parseArgs(c.argumentsJson) ?? {},
    expected: c.expectedOutput,
  }));
}

/** Rules every model-chosen set of test cases must follow, attempts and solutions alike. */
export function checkTestCases(cases: { argumentsJson: string }[]): string[] {
  const issues: string[] = [];
  if (cases.length < MIN_CASES) issues.push(`- give at least ${MIN_CASES} testCases covering different situations`);
  cases.forEach((c, i) => {
    if (!parseArgs(c.argumentsJson)) issues.push(`- testCases[${i}].argumentsJson must be a valid JSON object of named arguments`);
  });
  const unique = new Set(cases.map((c) => c.argumentsJson.replace(/\s+/g, "")));
  if (unique.size < cases.length) issues.push("- two testCases have the same arguments; every case must be a different input");
  return issues;
}

/** The problem's fixed test cases, as the pipeline carries them. */
export function casesFromHarness(h: ReadyHarness): PipelineCase[] {
  return h.cases.slice(0, MAX_CASES_HARD).map((c, i) => ({
    id: `c${i + 1}`,
    label: c.label,
    description: describeArgs(h.params, c.argsJson, h.cycle),
    args: parseArgs(c.argsJson) ?? {},
    expected: c.expectedJson,
  }));
}

/**
 * Stage 1. With `fixed` cases (the problem's harness), the model only reads the approach; the cases are
 * stored on the understanding as if it had picked them, so regenerations reuse them.
 */
export async function understand(ctx: Ctx, guidance?: Guidance, fixed?: PipelineCase[]): Promise<Understanding> {
  if (fixed) {
    const core = await generateStructured({
      model: ctx.model,
      meter: ctx.meter,
      signal: ctx.signal,
      name: "understanding",
      schema: understandingCoreSchema,
      instructions: instr(ctx, UNDERSTAND_FIXED_ROLE),
      prompt: `${learnerContext(ctx.learner)}${withReference(ctx)}\n\n${casesBlock(fixed)}`,
    });
    return {
      ...core,
      testCases: fixed.map((c) => ({
        label: c.label,
        description: c.description,
        argumentsJson: JSON.stringify(c.args),
        expectedOutput: c.expected,
      })),
    };
  }
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "understanding",
    schema: understandingSchema,
    instructions: instr(ctx, UNDERSTAND_ROLE),
    prompt: `${learnerContext(ctx.learner)}${withReference(ctx)}${guidanceBlock(guidance)}`,
    check: (u) => {
      const issues = checkTestCases(u.testCases);
      return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: u };
    },
  });
}

// Stage 2: execution path ------------------------------------------------

function caseBlock(c: PipelineCase) {
  return `<test_input case="${c.id}" label="${c.label}">\n${c.description}\narguments: ${JSON.stringify(c.args)}\nexpected (correct) output: ${c.expected}\n</test_input>`;
}

function casesBlock(cases: PipelineCase[]) {
  return `<test_cases>\n${cases
    .map((c) => `${c.id} (${c.label}): ${c.description}\narguments: ${JSON.stringify(c.args)}\nexpected (correct) output: ${c.expected}`)
    .join("\n\n")}\n</test_cases>`;
}

export function checkDeclarations(t: { codeLines: string[]; addedLines: number[]; structures: Structure[]; loops: Loop[] }): string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  for (const s of t.structures) {
    if (ids.has(s.id)) issues.push(`- duplicate structure id "${s.id}"`);
    ids.add(s.id);
  }
  if (t.codeLines.length === 0) issues.push("- codeLines is empty");
  for (const l of t.loops) {
    if (l.line < 0 || l.line >= t.codeLines.length) issues.push(`- loop "${l.id}" line ${l.line} is outside codeLines`);
  }
  const outside = t.addedLines.filter((i) => i < 0 || i >= t.codeLines.length);
  if (outside.length) issues.push(`- addedLines ${outside.join(", ")} are outside codeLines`);
  return issues;
}

export function runNoteFor(result: SandboxResult): string | null {
  switch (result.outcome) {
    case "timeout":
      return `The code never finished on this input (${result.errorMessage}). It most likely loops forever.`;
    case "trace_limit":
      return `The code was still running after hundreds of steps, which suggests a loop that doesn't make progress.`;
    case "runtime_error":
      return `The code crashed: ${result.errorMessage}.`;
    default:
      return null;
  }
}

export function actualOutputOf(result: SandboxResult): string {
  return result.outcome === "ok" ? (result.returnValue ?? "undefined") : (runNoteFor(result) ?? "error");
}

/** Gives a case's steps ids that are unique across cases. */
export function prefixStepIds(caseId: string, steps: Step[]): Step[] {
  return steps.map((s) => ({ ...s, id: `${caseId}-${s.id}` }));
}

/** The model's plain-JS translation, instrumented in code and ready to run. */
export type Program = {
  codeLines: string[];
  addedLines: number[];
  program: string;
  decl: ShowDecl;
  loops: Loop[];
};

/** Checks a translation and instruments it; issues go back to the model. */
export function prepareProgram(t: Translation): { program?: Program; issues: string[] } {
  const issues: string[] = [];
  if (!t.codeLines.length) issues.push("- codeLines is empty");
  const outsideAdded = t.addedLines.filter((i) => i < 0 || i >= t.codeLines.length);
  if (outsideAdded.length) issues.push(`- addedLines ${outsideAdded.join(", ")} are outside codeLines`);
  let markers: Map<number, number>;
  try {
    markers = markerLines(parseProgram(t.program).comments);
  } catch (err) {
    return { issues: [...issues, `- program isn't valid JavaScript: ${err instanceof Error ? err.message : String(err)}`] };
  }
  if (!markers.size) issues.push("- no statement in program carries a //@n marker; mark every statement of their logic");
  const outside = [...markers.values()].filter((n) => n >= t.codeLines.length);
  if (outside.length) issues.push(`- markers //@${outside.join(", //@")} point outside codeLines`);
  if (issues.length) return { issues };

  const inst = instrumentJs(t.program, { lineFor: (l) => markers.get(l) ?? null, hiddenFunctions: ["run"] });
  return {
    issues,
    program: {
      codeLines: t.codeLines,
      addedLines: t.addedLines,
      program: inst.program,
      decl: {
        structures: t.structures.map((s) => ({ id: s.variable, label: s.label, kind: s.kind })),
        pointers: t.pointers.map((p) => ({ variable: p.variable, structureId: p.structure })),
      },
      loops: inst.loops.map((l) => ({ ...l, label: (t.codeLines[l.line] ?? "").trim().slice(0, 40) || l.id })),
    },
  };
}

async function translate(ctx: Ctx, cases: PipelineCase[], feedback: string, guidance?: Guidance): Promise<Program> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "program",
    schema: translationSchema,
    instructions: instr(ctx, TRANSLATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}${signatureBlock(ctx)}\n\n${casesBlock(cases)}${guidanceBlock(guidance)}${
      feedback ? `\n\n<previous_program_failed>\n${feedback}\n</previous_program_failed>` : ""
    }`,
    maxOutputTokens: 12_000,
    check: (t) => {
      const { program, issues } = prepareProgram(t);
      return program ? { ok: true, value: program } : { ok: false, issues: issues.join("\n") };
    },
  });
}

/** The function the learner's completed code should define, when the problem's harness knows it. */
function signatureBlock(ctx: Ctx): string {
  const h = ctx.harness;
  if (!h) return "";
  return `\n\n<signature>\n${signatureText(h, true)}\n</signature>`;
}

/** One case's run: its own structures (whatever its variables held) and steps. */
export type AutoRun = { result: SandboxResult; structures: Structure[]; steps: Step[] };

/**
 * Runs the instrumented program on every case. `problem` says what's wrong with the program itself (it
 * should be translated again); a case that recorded no steps is a null run.
 */
export async function runProgram(
  p: Program,
  cases: PipelineCase[],
  returnType?: ValueType,
): Promise<{ runs: (AutoRun | null)[]; results: SandboxResult[]; problem: string | null }> {
  const results = await Promise.all(cases.map((c) => runInSandbox(p.program, c.args, returnType)));
  const runs = results.map((result): AutoRun | null => {
    const events = result.events.filter(isAutoEvent);
    if (!events.length) return null;
    return { result, ...autoSteps(events, p.decl, p.loops, p.codeLines.length) };
  });
  const invalid = results.find((r) => r.outcome === "invalid_program");
  const problem = invalid
    ? `The program didn't load: ${invalid.errorMessage}`
    : runs.every((r) => !r)
      ? `No marked statement ran on any case${results[0].outcome === "runtime_error" ? ` (it crashed: ${results[0].errorMessage})` : ""}.`
      : null;
  return { runs, results, problem };
}

type CompletedCode = { codeLines: string[]; addedLines: number[] };

type Execution =
  | { ok: true; p: Program; runs: (AutoRun | null)[]; results: SandboxResult[] }
  /** `code` is the last translation's completed code, if any, which the simulations can share. */
  | { ok: false; code: CompletedCode | null };

/**
 * Translates to plain JS, instruments it in code and runs it in QuickJS on every case. A program that
 * doesn't load or never reaches a marked statement gets one retry with the error. When execution isn't
 * usable at all the caller falls back to simulation, with the completed code a broken program still
 * came with. Cases that recorded no steps come back as null runs.
 */
async function executeAll(ctx: Ctx, cases: PipelineCase[], guidance?: Guidance): Promise<Execution> {
  let feedback = "";
  let code: CompletedCode | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let p: Program;
    try {
      p = await translate(ctx, cases, feedback, guidance);
    } catch (err) {
      if (err instanceof PipelineError && err.code === "invalid_output") {
        ctx.meter.note("no valid program from the model");
        return { ok: false, code };
      }
      throw err;
    }
    code = { codeLines: p.codeLines, addedLines: p.addedLines };
    ctx.progress?.update((pr) => {
      pr.program = { lines: p.codeLines.length, added: p.addedLines.length };
      for (const c of pr.cases ?? []) c.state = "running";
    });
    const { runs, results, problem } = await runProgram(p, cases, answerType(ctx));
    if (!problem) return { ok: true, p, runs, results };
    ctx.meter.note(`program ${attempt + 1} rejected: ${problem}`);
    feedback = problem;
    ctx.progress?.update((pr) => {
      pr.program = { lines: p.codeLines.length, added: p.addedLines.length, retrying: true };
      for (const c of pr.cases ?? []) c.state = "pending";
    });
  }
  return { ok: false, code };
}

/**
 * The type of what run(input) returns, when the harness says and the answer is a return value (not an
 * argument changed in place, which run() doesn't hand back).
 */
function answerType(ctx: Ctx): ValueType | undefined {
  const h = ctx.harness;
  return h && !h.outputParam ? (harnessAnswer(h) ?? undefined) : undefined;
}

/** Whether a run answered the case, checked against the harness's expected answer; undefined when that can't be told. */
function checkAnswer(ctx: Ctx, c: PipelineCase, result: SandboxResult): boolean | undefined {
  const h = ctx.harness;
  if (!h || !answerType(ctx)) return undefined;
  if (result.outcome !== "ok") return false;
  if (result.returnJson === null) return undefined;
  try {
    return sameAnswer(h.compare, JSON.parse(result.returnJson), JSON.parse(c.expected)) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * A case whose run crashed or hung before reaching a marked statement. The other cases ran, so the
 * program works and the failure is the learner's logic on this input: one step saying so beats
 * simulating it.
 */
function crashTrace(c: PipelineCase, result: SandboxResult): CaseTrace | null {
  if (result.outcome !== "runtime_error" && result.outcome !== "timeout") return null;
  const crashed = result.outcome === "runtime_error";
  const step: Step = {
    id: "s1",
    line: null,
    title: crashed ? "Crashes before the first step" : "Never gets past the start",
    explanation: crashed
      ? `On this input your code stops with an error before reaching its first step: ${result.errorMessage}.`
      : "On this input your code never gets past its first lines; it most likely loops without making progress.",
    states: { vars: { kind: "variables", vars: {} } },
    isBugMoment: true,
  };
  return {
    ...c,
    mode: "execution",
    structures: [{ id: "vars", label: "Variables", kind: "variables" }],
    loops: [],
    steps: prefixStepIds(c.id, [step]),
    actualOutput: actualOutputOf(result),
    runNote: runNoteFor(result),
  };
}

/** Bounds a case's actual output for prompts and the spec; a whole return value can be long. */
export function shownOutput(result: SandboxResult): string {
  return result.outcome === "ok" && result.returnJson && result.returnJson.length <= 400 ? result.returnJson : actualOutputOf(result);
}

async function narrate(ctx: Ctx, u: Understanding, c: PipelineCase, codeLines: string[], steps: Step[], result: SandboxResult) {
  const ids = steps.map((s) => s.id);
  const narration = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "step narration",
    schema: narrationSchema,
    instructions: instr(ctx, NARRATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${caseBlock(c)}\n\n<suspected_issue>${u.suspectedIssue}</suspected_issue>\n\n<code_lines>\n${codeLines
      .map((l, i) => `${i + 1}: ${l}`)
      .join("\n")}\n</code_lines>\n\n<run_result>${
      result.outcome === "ok" ? `returned ${result.returnValue}` : runNoteFor(result)
    }</run_result>\n\n<trace>\n${describeSteps(steps, codeLines)}\n</trace>\n\nNarrate every step id: ${ids.join(", ")}.`,
    maxOutputTokens: 16_000,
    check: (n) => {
      const got = new Set(n.steps.map((s) => s.id));
      const missing = ids.filter((id) => !got.has(id));
      // A few gaps are tolerable; they keep their placeholder titles.
      if (missing.length > Math.max(2, ids.length * 0.1)) {
        return { ok: false, issues: `- missing narration for step ids: ${missing.slice(0, 30).join(", ")}` };
      }
      return { ok: true, value: n };
    },
  });
  const byId = new Map(narration.steps.map((s) => [s.id, s]));
  return steps.map((s) => {
    const n = byId.get(s.id);
    if (!n) return s;
    // Collapsed steps keep their "…iterations omitted" title.
    if (s.title.startsWith("…iterations")) return { ...s, isBugMoment: n.isBugMoment || undefined };
    return {
      ...s,
      title: n.title.slice(0, 120) || s.title,
      explanation: n.explanation.slice(0, 600),
      isBugMoment: n.isBugMoment || undefined,
    };
  });
}

// Stage 2: simulation fallback --------------------------------------------

function wireToState(w: WireState, kind: Structure["kind"]): StructureState | null {
  const scalarish = (v: unknown) => (typeof v === "boolean" ? String(v) : (v as string | number | null));
  const raw: Record<string, unknown> = { kind };
  switch (kind) {
    case "array":
    case "string":
      raw.values = (w.values ?? []).map(scalarish);
      break;
    case "set":
      raw.values = w.values ?? [];
      break;
    case "stack":
    case "queue":
      raw.items = w.values ?? [];
      break;
    case "hashmap":
      raw.entries = (w.entries ?? []).map((e) => [e.key, e.value]);
      break;
    case "variables":
      raw.vars = Object.fromEntries((w.vars ?? []).map((v) => [v.name, v.value]));
      break;
    case "matrix":
      raw.rows = w.rows ?? [];
      break;
    case "linkedList":
      raw.nodes = (w.nodes ?? []).map((n) => ({ id: n.id, value: n.value, next: n.next ?? null }));
      raw.headId = w.rootId ?? null;
      break;
    case "tree":
      raw.nodes = (w.nodes ?? []).map((n) => ({
        id: n.id,
        value: n.value,
        ...(n.children?.length ? { children: n.children } : { left: n.left ?? null, right: n.right ?? null }),
      }));
      raw.rootId = w.rootId ?? null;
      break;
    case "graph":
      raw.nodes = (w.nodes ?? []).map((n) => ({ id: n.id, label: n.value ?? n.id }));
      raw.edges = (w.edges ?? []).map((e) => ({ from: e.from, to: e.to, ...(e.weight != null && { weight: e.weight }) }));
      raw.directed = Boolean(w.directed);
      break;
  }
  const parsed = structureStateSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function simulationToSteps(sim: Simulation): { steps: Step[]; issues: string[] } {
  const kinds = new Map(sim.structures.map((s) => [s.id, s.kind]));
  const loopIds = new Set(sim.loops.map((l) => l.id));
  const issues: string[] = [];
  const steps = sim.steps.map((s, i): Step => {
    const states: Record<string, StructureState> = {};
    for (const w of s.states) {
      const kind = kinds.get(w.structureId);
      if (!kind) {
        issues.push(`- step ${i}: state for undeclared structure "${w.structureId}"`);
        continue;
      }
      const st = wireToState(w, kind);
      if (st) states[w.structureId] = st;
      else issues.push(`- step ${i}: malformed ${kind} state for "${w.structureId}"`);
    }
    const iteration =
      s.loopId && loopIds.has(s.loopId) && s.iterationIndex >= 0 ? { loopId: s.loopId, index: s.iterationIndex } : undefined;
    return {
      id: `s${i + 1}`,
      line: s.line >= 0 && s.line < sim.codeLines.length ? s.line : null,
      ...(iteration && { iteration }),
      title: s.title.slice(0, 120) || `Step ${i + 1}`,
      explanation: s.explanation.slice(0, 600),
      states,
      pointers: s.pointers.filter((p) => kinds.has(p.structureId)),
      highlights: s.highlights.filter((h) => kinds.has(h.structureId)),
      ...(s.event !== "none" && { event: s.event }),
      ...(s.isBugMoment && { isBugMoment: true }),
    };
  });
  return { steps, issues };
}

/** Validates one case's walkthrough on its own, in the shape of a whole spec. */
export function checkCaseShape(
  code: { codeLines: string[]; addedLines: number[] },
  c: Pick<TestCase, "structures" | "loops" | "steps">,
): string | null {
  const probe = vizSpecSchema.safeParse({
    version: 2,
    summary: { understoodApproach: "-", verdict: "unclear" },
    codeLines: code.codeLines,
    ...(code.addedLines.length && { addedLines: code.addedLines }),
    cases: [{ id: "c1", label: "-", input: "-", expectedOutput: "", actualOutput: "", ...c }],
    diagnosis: { whatGoesWrong: "", whyItGoesWrong: "", bugStepIds: [], thinkingHints: [] },
  } satisfies VizSpec);
  return probe.success ? null : formatSpecIssues(probe.error);
}

/**
 * Fallback: the model simulates one case by hand. With `fixed`, the code was already completed (by
 * the translation or an earlier case's simulation) and every case must use the same lines.
 */
async function traceBySimulation(
  ctx: Ctx,
  c: PipelineCase,
  guidance?: Guidance,
  fixed?: { codeLines: string[]; addedLines: number[] },
): Promise<{ codeLines: string[]; addedLines: number[]; trace: CaseTrace }> {
  const completed = fixed
    ? `\n\n<completed_code note="0-based line numbers; added lines: ${fixed.addedLines.join(", ") || "none"}">\n${fixed.codeLines
        .map((l, i) => `${i}: ${l}`)
        .join("\n")}\n</completed_code>`
    : "";
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "simulated trace",
    schema: simulationSchema,
    instructions: instr(ctx, SIMULATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${caseBlock(c)}${completed}${guidanceBlock(guidance)}`,
    maxOutputTokens: 32_000,
    check: (raw) => {
      // Line numbers must point into the shared code, whatever the model copied back.
      const sim = fixed ? { ...raw, ...fixed } : raw;
      const decl = checkDeclarations(sim);
      const { steps, issues } = simulationToSteps(sim);
      const all = [...decl, ...issues];
      const shape = checkCaseShape(sim, { structures: sim.structures, loops: sim.loops, steps });
      if (shape) all.push(shape);
      if (all.length) return { ok: false, issues: all.slice(0, 20).join("\n") };
      return {
        ok: true,
        value: {
          codeLines: sim.codeLines,
          addedLines: sim.addedLines,
          trace: {
            ...c,
            mode: "simulation" as const,
            structures: sim.structures,
            loops: sim.loops,
            steps: prefixStepIds(c.id, steps),
            actualOutput: sim.actualOutput,
            runNote: null,
          },
        },
      };
    },
  });
}

/** Stage 2's output: every case traced, and the same traces once their steps are narrated. */
export type TracedCases = { trace: TraceResult; narrated: Promise<TraceResult> };

/**
 * Stage 2 for every case: one translation run on each case, narrated per case in parallel. A case
 * the program can't trace is simulated by hand instead, on the same completed code, unless its run
 * crashed before the first step, which is shown as is. Returns once every case has its steps, while
 * narration still runs: diagnosis only needs the raw trace, so it runs alongside. Narration keeps
 * every step id, so the diagnosis's bugStepIds stay valid.
 */
export async function traceCases(
  ctx: Ctx,
  cases: PipelineCase[],
  understanding: Understanding | Promise<Understanding>,
  guidance?: Guidance,
): Promise<TracedCases> {
  const finished = (t: CaseTrace) => {
    ctx.progress?.updateCase(t.id, { state: "done", actual: t.actualOutput, steps: t.steps.length, passed: t.passed });
    return t;
  };
  ctx.progress?.update((p) => {
    p.cases = cases.map((c) => ({ id: c.id, label: c.label, description: c.description, expected: c.expected, state: "pending" }));
  });

  const exec = await executeAll(ctx, cases, guidance);
  const traces: (CaseTrace | null)[] = cases.map(() => null);
  const narrations: (Promise<CaseTrace> | null)[] = cases.map(() => null);
  let shared: CompletedCode;
  if (exec.ok) {
    shared = { codeLines: exec.p.codeLines, addedLines: exec.p.addedLines };
  } else {
    ctx.progress?.update((p) => {
      p.simulating = true;
      delete p.program;
      for (const c of p.cases ?? []) c.state = "pending";
    });
    if (exec.code) {
      // A program that didn't run still completed the code, so every case can be simulated at once.
      shared = exec.code;
    } else {
      // With no translation at all, the first simulation completes the code the others then share.
      ctx.progress?.updateCase(cases[0].id, { state: "simulating" });
      const sim = await traceBySimulation(ctx, cases[0], guidance);
      shared = { codeLines: sim.codeLines, addedLines: sim.addedLines };
      traces[0] = finished(sim.trace);
    }
  }

  await Promise.all(
    cases.map(async (c, i) => {
      if (traces[i]) return;
      const run = exec.ok ? exec.runs[i] : null;
      if (exec.ok && run) {
        const steps = prefixStepIds(c.id, collapseSteps(run.steps, exec.p.loops));
        const trace: CaseTrace = {
          ...c,
          mode: "execution",
          structures: run.structures,
          loops: exec.p.loops,
          steps,
          actualOutput: shownOutput(run.result),
          runNote: runNoteFor(run.result),
          passed: checkAnswer(ctx, c, run.result),
        };
        ctx.progress?.updateCase(c.id, { state: "explaining", actual: trace.actualOutput, steps: steps.length });
        traces[i] = trace;
        // Narration needs the suspected issue, which may still be on its way when tracing started early.
        const narration = Promise.resolve(understanding)
          .then((u) => narrate(ctx, u, c, shared.codeLines, steps, run.result))
          .then((narrated) => finished({ ...trace, steps: narrated }));
        // Awaited below, maybe after a simulation fails first; this keeps that from counting as unhandled.
        narration.catch(() => {});
        narrations[i] = narration;
        return;
      }
      if (exec.ok) {
        const result = exec.results[i];
        const crashed = crashTrace(c, result);
        if (crashed) {
          ctx.meter.note(`${c.id} ${result.outcome} before its first step: ${result.errorMessage}`);
          traces[i] = finished({ ...crashed, passed: checkAnswer(ctx, c, result) });
          return;
        }
        ctx.meter.note(`${c.id} reached no marked statement (${result.outcome}); simulated instead`);
      }
      ctx.progress?.updateCase(c.id, { state: "simulating" });
      traces[i] = finished((await traceBySimulation(ctx, c, guidance, shared)).trace);
    }),
  );

  const result = (done: CaseTrace[]): TraceResult => ({
    mode: done.every((t) => t.mode === "execution") ? "execution" : "simulation",
    codeLines: shared.codeLines,
    addedLines: shared.addedLines,
    cases: done,
  });
  const raw = traces as CaseTrace[];
  const narrated = Promise.all(raw.map((t, i) => narrations[i] ?? t)).then(result);
  narrated.catch(() => {});
  return { trace: result(raw), narrated };
}

// Stage 3 ---------------------------------------------------------------

/**
 * Builds the spec. The diagnosis decides which cases fail; failing cases come first (in the order the
 * model chose them) so the one shown by default is where the code goes wrong.
 */
export function assemble(trace: TraceResult, d: DiagnosisOutput, u: Understanding, autoTags?: string[]): VizSpec {
  const failing = new Set(d.failingCaseIds);
  const ordered = [...trace.cases.filter((c) => failing.has(c.id)), ...trace.cases.filter((c) => !failing.has(c.id))];
  return {
    version: 2,
    summary: {
      understoodApproach: (d.understoodApproach || u.userApproachInOwnWords || "-").slice(0, 1200),
      verdict: d.verdict,
    },
    codeLines: trace.codeLines,
    ...(trace.addedLines.length && { addedLines: [...new Set(trace.addedLines)].sort((a, b) => a - b) }),
    cases: ordered.map((c) => ({
      id: c.id,
      label: c.label.slice(0, 60),
      input: c.description.slice(0, 600) || "-",
      expectedOutput: c.expected.slice(0, 400),
      actualOutput: c.actualOutput.slice(0, 400),
      passed: !failing.has(c.id),
      structures: c.structures,
      loops: c.loops,
      steps: c.steps,
    })),
    diagnosis: {
      whatGoesWrong: d.whatGoesWrong,
      whyItGoesWrong: d.whyItGoesWrong,
      bugStepIds: d.bugStepIds,
      ...(d.failingInputs.length && { failingInputs: d.failingInputs }),
      thinkingHints: d.thinkingHints,
      ...(d.rethinkScope !== "none" &&
        d.brokenAssumption && {
          rethink: { scope: d.rethinkScope, brokenAssumption: d.brokenAssumption, shiftInThinking: d.shiftInThinking },
        }),
    },
    ...(autoTags?.length && { autoTags }),
  };
}

/** Scaffolding the pipeline wrote; the learner shouldn't be blamed for it. */
function addedLinesBlock(t: Pick<TraceResult, "codeLines" | "addedLines">): string {
  if (!t.addedLines.length) return "";
  const lines = t.addedLines.map((i) => `${i}: ${(t.codeLines[i] ?? "").trim()}`).join("\n");
  return `\n\n<lines_added_to_complete_their_code note="not written by the learner; don't attribute bugs to these">\n${lines}\n</lines_added_to_complete_their_code>`;
}

export async function diagnose(ctx: Ctx, u: Understanding, trace: TraceResult, stricter = false): Promise<DiagnosisOutput> {
  const stepIds = new Set(trace.cases.flatMap((c) => c.steps.map((s) => s.id)));
  const caseIds = new Set(trace.cases.map((c) => c.id));
  // Keep the whole prompt about the size a single trace used to be.
  const perCase = Math.max(6_000, Math.floor(30_000 / trace.cases.length));
  const checked = (c: CaseTrace) =>
    c.passed === undefined ? "" : c.passed ? " (checked in code: matches the expected answer)" : " (checked in code: does NOT match the expected answer)";
  const results = trace.cases
    .map((c) => `${c.id}: actual output: ${c.actualOutput}${checked(c)}${c.runNote ? `\n${c.runNote}` : ""}`)
    .join("\n");
  const traces = trace.cases
    .map((c) => `<trace case="${c.id}">\n${describeSteps(c.steps, trace.codeLines, perCase)}\n</trace>`)
    .join("\n\n");
  const d = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "diagnosis",
    schema: diagnosisOutputSchema,
    instructions: instr(ctx, stricter ? `${DIAGNOSE_ROLE}\n\n${STRICTER_ADDENDUM}` : DIAGNOSE_ROLE),
    prompt: `${learnerContext(ctx.learner)}${withReference(ctx)}\n\n${casesBlock(trace.cases)}\n\n<their_approach>${u.userApproachInOwnWords}</their_approach>\n<assumptions>${u.keyInvariantsUserAssumes.join("; ")}</assumptions>${addedLinesBlock(trace)}\n\n<run_results>\n${results}\n</run_results>\n\n${traces}`,
    check: (d) => {
      const unknown = d.bugStepIds.filter((id) => !stepIds.has(id));
      if (unknown.length) return { ok: false, issues: `- bugStepIds not in the traces: ${unknown.join(", ")}` };
      if (d.verdict !== "works" && d.thinkingHints.length < 2) {
        return { ok: false, issues: "- give 2–4 progressive thinkingHints" };
      }
      if (d.verdict !== "works" && (d.rethinkScope === "none" || !d.brokenAssumption)) {
        return { ok: false, issues: "- give rethinkScope and brokenAssumption" };
      }
      return { ok: true, value: d };
    },
  });
  // Where the answer was checked in code, that settles whether the case fails.
  const known = new Map(trace.cases.filter((c) => c.passed !== undefined).map((c) => [c.id, c.passed]));
  const failing = new Set(d.failingCaseIds.filter((id) => caseIds.has(id) && !known.has(id)));
  for (const [id, passed] of known) if (!passed) failing.add(id);
  return { ...d, failingCaseIds: trace.cases.map((c) => c.id).filter((id) => failing.has(id)) };
}

/**
 * Lightweight check: does this text give away more of the solution than it should? With `question`
 * (a chat answer), describing the fix is allowed when the learner asked for it.
 */
export async function revealsSolution(
  ctx: Ctx,
  text: string,
  question?: string,
): Promise<{ reveals: boolean; sentence: string }> {
  const asked = question ? `\n\n<question>\n${question}\n</question>` : "";
  const r = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "solution check",
    schema: guardrailSchema,
    instructions: GUARDRAIL_ROLE,
    prompt: `<problem>\n${ctx.learner.statement}\n</problem>${asked}\n\n<feedback>\n${text}\n</feedback>`,
  });
  return { reveals: r.revealsSolution, sentence: r.offendingSentence };
}

/** Labelled so the guardrail can tell the up-front parts from the hints revealed on request. */
export function diagnosisText(d: DiagnosisOutput): string {
  return [
    d.whatGoesWrong && `What goes wrong: ${d.whatGoesWrong}`,
    d.whyItGoesWrong && `Why: ${d.whyItGoesWrong}`,
    ...d.failingInputs.map((f) => `Failing input: ${f}`),
    d.brokenAssumption && `Broken assumption: ${d.brokenAssumption}`,
    d.shiftInThinking && `A different way to think about it: ${d.shiftInThinking}`,
    ...d.thinkingHints.map((h, i) => `Hint ${i + 1} of ${d.thinkingHints.length}: ${h}`),
  ]
    .filter(Boolean)
    .join("\n");
}
