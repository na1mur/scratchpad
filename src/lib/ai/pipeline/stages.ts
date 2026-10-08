import "server-only";
import type { LanguageModel } from "ai";
import { baseInstructions, learnerContext } from "@/lib/ai/prompts/system";
import {
  DIAGNOSE_ROLE,
  GUARDRAIL_ROLE,
  NARRATE_ROLE,
  SIMULATE_ROLE,
  STRICTER_ADDENDUM,
  TRANSLATE_ROLE,
  UNDERSTAND_ROLE,
} from "@/lib/ai/prompts/pipeline";
import {
  diagnosisOutputSchema,
  guardrailSchema,
  narrationSchema,
  simulationSchema,
  translationSchema,
  understandingSchema,
  type DiagnosisOutput,
  type Simulation,
  type Translation,
  type Understanding,
  type WireState,
} from "@/lib/ai/schemas/pipeline";
import {
  formatSpecIssues,
  structureStateSchema,
  vizSpecSchema,
  type Loop,
  type Step,
  type Structure,
  type StructureState,
  type VizSpec,
} from "@/lib/ai/schemas/vizSpec";
import { PipelineError, generateStructured, type UsageMeter } from "./llm";
import { runInSandbox, type SandboxResult } from "./sandbox";
import { collapseSteps, describeSteps, eventsToSteps } from "./steps";

/** `source` is the linked page's text (src/lib/problemSource.ts), "" if there's none. */
export type LearnerInput = { statement: string; source?: string; pseudoCode: string; idea: string; language: string };

export type Ctx = { model: LanguageModel; meter: UsageMeter; learner: LearnerInput };

/** Steering from a follow-up question when regenerating a visualization. */
export type Guidance = { reason: string; focus?: string; newTestInput?: string };

export type TraceResult = {
  mode: "execution" | "simulation";
  codeLines: string[];
  addedLines: number[];
  structures: Structure[];
  loops: Loop[];
  steps: Step[];
  actualOutput: string;
  /** How the run ended, for the diagnosis ("never terminated", "crashed"). */
  runNote: string | null;
};

const instr = (ctx: Ctx, role: string) => baseInstructions(ctx.learner.language, role);

function guidanceBlock(g?: Guidance) {
  if (!g) return "";
  return `\n\n<regeneration_request>\nThe learner asked for a new visualization. Reason: ${g.reason}${
    g.focus ? `\nFocus on: ${g.focus}` : ""
  }${g.newTestInput ? `\nUse this test input instead: ${g.newTestInput}` : ""}\n</regeneration_request>`;
}

// Stage 1 ---------------------------------------------------------------

export function understand(ctx: Ctx, guidance?: Guidance): Promise<Understanding> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "understanding",
    schema: understandingSchema,
    instructions: instr(ctx, UNDERSTAND_ROLE),
    prompt: `${learnerContext(ctx.learner)}${guidanceBlock(guidance)}`,
    check: (u) => {
      try {
        const args = JSON.parse(u.chosenTestInput.argumentsJson);
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("not an object");
        return { ok: true, value: u };
      } catch {
        return { ok: false, issues: "- chosenTestInput.argumentsJson must be a valid JSON object of named arguments" };
      }
    },
  });
}

// Stage 2: execution path ------------------------------------------------

function inputBlock(u: Understanding) {
  return `<test_input>\n${u.chosenTestInput.description}\narguments: ${u.chosenTestInput.argumentsJson}\nexpected (correct) output: ${u.expectedOutput}\n</test_input>`;
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

async function translate(ctx: Ctx, u: Understanding, feedback: string, guidance?: Guidance): Promise<Translation> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "instrumented program",
    schema: translationSchema,
    instructions: instr(ctx, TRANSLATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${inputBlock(u)}${guidanceBlock(guidance)}${
      feedback ? `\n\n<previous_program_failed>\n${feedback}\n</previous_program_failed>` : ""
    }`,
    maxOutputTokens: 12_000,
    check: (t) => {
      const issues = checkDeclarations(t);
      return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: t };
    },
  });
}

/**
 * Translate to instrumented JS and run it in QuickJS. A failed translation
 * gets one retry with the error; returns null when execution isn't usable
 * so the caller can fall back to simulation.
 */
export async function traceByExecution(ctx: Ctx, u: Understanding, guidance?: Guidance): Promise<TraceResult | null> {
  const args = JSON.parse(u.chosenTestInput.argumentsJson);
  let feedback = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let t: Translation;
    try {
      t = await translate(ctx, u, feedback, guidance);
    } catch (err) {
      if (err instanceof PipelineError && err.code === "invalid_output") return null;
      throw err;
    }
    const result = await runInSandbox(t.program, args);
    const { steps, problems } = eventsToSteps(result.events, t.structures, t.loops, t.codeLines.length);

    const brokenProgram =
      result.outcome === "invalid_program" ||
      steps.length === 0 ||
      problems.badStates > steps.length ||
      problems.unknownStructures.size > 0;
    if (brokenProgram) {
      feedback = [
        result.outcome === "invalid_program" ? `The program didn't load: ${result.errorMessage}` : null,
        result.outcome === "runtime_error" && steps.length === 0
          ? `It crashed before the first trace() call: ${result.errorMessage}`
          : null,
        steps.length === 0 && result.outcome !== "invalid_program" ? "It made no trace() calls." : null,
        problems.unknownStructures.size
          ? `trace() used structure ids that aren't declared: ${[...problems.unknownStructures].join(", ")}`
          : null,
        problems.badStates ? `${problems.badStates} snapshots were malformed; build states only with the S.* helpers.` : null,
      ]
        .filter(Boolean)
        .join("\n");
      continue;
    }

    const collapsed = collapseSteps(steps, t.loops);
    const narrated = await narrate(ctx, u, t, collapsed, result);
    return {
      mode: "execution",
      codeLines: t.codeLines,
      addedLines: t.addedLines,
      structures: t.structures,
      loops: t.loops,
      steps: narrated,
      actualOutput: result.outcome === "ok" ? (result.returnValue ?? "undefined") : (runNoteFor(result) ?? "error"),
      runNote: runNoteFor(result),
    };
  }
  return null;
}

async function narrate(
  ctx: Ctx,
  u: Understanding,
  t: { codeLines: string[] },
  steps: Step[],
  result: SandboxResult,
): Promise<Step[]> {
  const ids = steps.map((s) => s.id);
  const narration = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "step narration",
    schema: narrationSchema,
    instructions: instr(ctx, NARRATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${inputBlock(u)}\n\n<suspected_issue>${u.suspectedIssue}</suspected_issue>\n\n<code_lines>\n${t.codeLines
      .map((l, i) => `${i + 1}: ${l}`)
      .join("\n")}\n</code_lines>\n\n<run_result>${
      result.outcome === "ok" ? `returned ${result.returnValue}` : runNoteFor(result)
    }</run_result>\n\n<trace>\n${describeSteps(steps, t.codeLines)}\n</trace>\n\nNarrate every step id: ${ids.join(", ")}.`,
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

/** Fallback: the model simulates the whole run itself. */
export async function traceBySimulation(ctx: Ctx, u: Understanding, guidance?: Guidance): Promise<TraceResult> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "simulated trace",
    schema: simulationSchema,
    instructions: instr(ctx, SIMULATE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${inputBlock(u)}${guidanceBlock(guidance)}`,
    maxOutputTokens: 32_000,
    check: (sim) => {
      const decl = checkDeclarations(sim);
      const { steps, issues } = simulationToSteps(sim);
      const all = [...decl, ...issues];
      // Validate the assembled shape with a placeholder summary/diagnosis.
      const probe = vizSpecSchema.safeParse(assemble(sim, steps, placeholderDiagnosis(sim.actualOutput)));
      if (!probe.success) all.push(formatSpecIssues(probe.error));
      if (all.length) return { ok: false, issues: all.slice(0, 20).join("\n") };
      return {
        ok: true,
        value: {
          mode: "simulation" as const,
          codeLines: sim.codeLines,
          addedLines: sim.addedLines,
          structures: sim.structures,
          loops: sim.loops,
          steps,
          actualOutput: sim.actualOutput,
          runNote: null,
        },
      };
    },
  });
}

// Stage 3 ---------------------------------------------------------------

function placeholderDiagnosis(actualOutput: string): DiagnosisOutput {
  return {
    understoodApproach: "-",
    verdict: "unclear",
    actualOutput,
    whatGoesWrong: "",
    whyItGoesWrong: "",
    bugStepIds: [],
    failingInputs: [],
    thinkingHints: [],
    rethinkScope: "none",
    brokenAssumption: "",
    shiftInThinking: "",
  };
}

export function assemble(
  trace: Pick<TraceResult, "codeLines" | "addedLines" | "structures" | "loops">,
  steps: Step[],
  d: DiagnosisOutput,
  u?: Understanding,
  autoTags?: string[],
): VizSpec {
  return {
    version: 1,
    summary: {
      understoodApproach: d.understoodApproach || u?.userApproachInOwnWords || "-",
      verdict: d.verdict,
      testInputDescription: u?.chosenTestInput.description ?? "-",
      expectedOutput: u?.expectedOutput ?? "",
      actualOutput: d.actualOutput,
    },
    codeLines: trace.codeLines,
    ...(trace.addedLines.length && { addedLines: [...new Set(trace.addedLines)].sort((a, b) => a - b) }),
    structures: trace.structures,
    loops: trace.loops,
    steps,
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
  const stepIds = new Set(trace.steps.map((s) => s.id));
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "diagnosis",
    schema: diagnosisOutputSchema,
    instructions: instr(ctx, stricter ? `${DIAGNOSE_ROLE}\n\n${STRICTER_ADDENDUM}` : DIAGNOSE_ROLE),
    prompt: `${learnerContext(ctx.learner)}\n\n${inputBlock(u)}\n\n<their_approach>${u.userApproachInOwnWords}</their_approach>\n<assumptions>${u.keyInvariantsUserAssumes.join("; ")}</assumptions>${addedLinesBlock(trace)}\n\n<run_result>\nactual output: ${trace.actualOutput}${
      trace.runNote ? `\n${trace.runNote}` : ""
    }\n</run_result>\n\n<trace>\n${describeSteps(trace.steps, trace.codeLines)}\n</trace>`,
    check: (d) => {
      const unknown = d.bugStepIds.filter((id) => !stepIds.has(id));
      if (unknown.length) return { ok: false, issues: `- bugStepIds not in the trace: ${unknown.join(", ")}` };
      if (d.verdict !== "works" && d.thinkingHints.length < 2) {
        return { ok: false, issues: "- give 2–4 progressive thinkingHints" };
      }
      if (d.verdict !== "works" && (d.rethinkScope === "none" || !d.brokenAssumption)) {
        return { ok: false, issues: "- give rethinkScope and brokenAssumption" };
      }
      return { ok: true, value: d };
    },
  });
}

/** Lightweight check: does this text give away a working solution? */
export async function revealsSolution(ctx: Ctx, text: string): Promise<{ reveals: boolean; sentence: string }> {
  const r = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "solution check",
    schema: guardrailSchema,
    instructions: GUARDRAIL_ROLE,
    prompt: `<problem>\n${ctx.learner.statement}\n</problem>\n\n<feedback>\n${text}\n</feedback>`,
  });
  return { reveals: r.revealsSolution, sentence: r.offendingSentence };
}

export function diagnosisText(d: DiagnosisOutput): string {
  return [
    d.whatGoesWrong,
    d.whyItGoesWrong,
    ...d.failingInputs,
    d.brokenAssumption,
    d.shiftInThinking && `A different way to think about it: ${d.shiftInThinking}`,
    ...d.thinkingHints.map((h, i) => `Hint ${i + 1}: ${h}`),
  ]
    .filter(Boolean)
    .join("\n");
}
