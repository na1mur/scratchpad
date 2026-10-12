import "server-only";
import type { LanguageModel } from "ai";
import { ApiError } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import {
  SOLUTION_NARRATE_ROLE,
  SOLUTION_SIMULATE_ROLE,
  SOLUTION_TRANSLATE_ROLE,
  solutionInstructions,
  solveRole,
} from "@/lib/ai/prompts/solution";
import { referenceBlock, sourceBlock } from "@/lib/ai/prompts/system";
import { narrationSchema, simulationSchema } from "@/lib/ai/schemas/pipeline";
import {
  SOLUTION_REQUEST_LABELS,
  buildsOnAttempt,
  solutionContentSchema,
  solutionPlanCoreSchema,
  solutionPlanSchema,
  solutionTranslationSchema,
  type SolutionContent,
  type SolutionPlan,
  type SolutionRequestKind,
} from "@/lib/ai/schemas/solution";
import { MAX_CASES_HARD, formatSpecIssues, vizSpecSchema, type Loop, type Step, type Structure, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { describeArgs, isReady, parseType, sameAnswer, type ReadyHarness, type ValueType } from "@/lib/harness/types";
import { jsDefinitions, resolveEntry } from "@/lib/runner/entry";
import { instrumentJs, parseProgram } from "@/lib/trace/instrument";
import { connectDB } from "@/lib/db";
import { ensureProblemReference, type Reference } from "@/lib/problemReference";
import { userSearchKey } from "@/lib/tavily";
import { ensureProblemSource } from "@/lib/problemSource";
import { loadSpec, storeSpec } from "@/lib/specStorage";
import { clearKeyRejected, markMainKeyRejected } from "@/lib/providerKeys";
import { deleteSolutionCascade } from "@/lib/cascade";
import { rateLimits } from "@/lib/rateLimit";
import { Attempt } from "@/models/Attempt";
import { Problem } from "@/models/Problem";
import { Solution, type SolutionStatus } from "@/models/Solution";
import { User } from "@/models/User";
import { emit } from "./events";
import { endRun, startRun } from "./cancel";
import { ProgressTracker } from "./progress";
import {
  PipelineError,
  RunCancelledError,
  UsageMeter,
  abortable,
  formatRunStats,
  generateStructured,
  throwIfCancelled,
} from "./llm";
import type { SandboxResult } from "./sandbox";
import {
  checkCaseShape,
  checkDeclarations,
  checkTestCases,
  prefixStepIds,
  prepareProgram,
  runNoteFor,
  runProgram,
  shownOutput,
  simulationToSteps,
  type AutoRun,
  type PipelineCase,
  type Program,
} from "./stages";
import { collapseSteps, describeSteps } from "./steps";

/**
 * `source` (the linked page's text) and `reference` (known solutions from the web) only go to the solve
 * stage; later stages work from the plan.
 */
type SolveCtx = {
  model: LanguageModel;
  meter: UsageMeter;
  language: string;
  statement: string;
  source: string;
  reference: Reference | null;
  /** Fires when the learner stops the run. */
  signal?: AbortSignal;
  progress: ProgressTracker;
  /** The problem's harness, when it's ready: fixed test cases with checked answers, and the signature. */
  harness?: ReadyHarness;
};

/** One case's walkthrough. `passed` is set only for a case that ran: whether it returned the expected value. */
type CaseTrace = PipelineCase & {
  mode: "execution" | "simulation";
  structures: Structure[];
  loops: Loop[];
  steps: Step[];
  actualOutput: string;
  passed?: boolean;
};

const instr = (ctx: SolveCtx, role: string) => solutionInstructions(ctx.language, role);

const numbered = (lines: string[]) => lines.map((l, i) => `${i}: ${l}`).join("\n");

function codeBlock(plan: SolutionPlan) {
  return `<solution_code note="0-based line numbers">\n${numbered(plan.codeLines)}\n</solution_code>`;
}

/** `expected` holds the expected return value as JSON. */
function casesOf(plan: SolutionPlan): PipelineCase[] {
  return plan.testCases.slice(0, MAX_CASES_HARD).map((c, i) => ({
    id: `c${i + 1}`,
    label: c.label.trim() || `Case ${i + 1}`,
    description: c.description,
    args: JSON.parse(c.argumentsJson),
    expected: c.expectedReturnJson,
  }));
}

function caseBlock(c: PipelineCase) {
  return `<test_input case="${c.id}" label="${c.label}">\n${c.description}\narguments: ${JSON.stringify(c.args)}\nexpected return: ${c.expected}\n</test_input>`;
}

function casesBlock(cases: PipelineCase[]) {
  return `<test_cases>\n${cases
    .map((c) => `${c.id} (${c.label}): ${c.description}\narguments: ${JSON.stringify(c.args)}\nexpected return: ${c.expected}`)
    .join("\n\n")}\n</test_cases>`;
}

/** Loose equality for return values: whitespace, quote style and case don't count. */
function sameResult(got: string | null, expectedJson: string): boolean {
  if (got === null) return false;
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/'/g, '"').toLowerCase();
  try {
    return norm(JSON.stringify(JSON.parse(got))) === norm(JSON.stringify(JSON.parse(expectedJson)));
  } catch {
    return norm(got) === norm(expectedJson);
  }
}

// Stage 1: solve ------------------------------------------------------------

type PlanContext = {
  attempt?: { version: number; pseudoCode: string; idea: string; spec: VizSpec | null };
  existing: { version: number; name: string; time: string; space: string }[];
  request: { kind: SolutionRequestKind; note: string };
};

function planPrompt(ctx: SolveCtx, pc: PlanContext): string {
  const parts = [
    `<problem>\n${ctx.statement}\n</problem>`,
    sourceBlock(ctx.source),
    referenceBlock(ctx.reference?.text),
  ].filter(Boolean);
  if (pc.attempt) {
    const d = pc.attempt.spec?.diagnosis;
    parts.push(
      [
        `<their_attempt version="${pc.attempt.version}">`,
        `<pseudocode>\n${pc.attempt.pseudoCode}\n</pseudocode>`,
        `<idea>\n${pc.attempt.idea || "(no explanation given)"}\n</idea>`,
        pc.attempt.spec
          ? [
              `verdict: ${pc.attempt.spec.summary.verdict}`,
              `what goes wrong: ${d?.whatGoesWrong || "-"}`,
              `why: ${d?.whyItGoesWrong || "-"}`,
              `scope: ${d?.rethink?.scope ?? "-"}`,
              `broken assumption: ${d?.rethink?.brokenAssumption || "-"}`,
            ].join("\n")
          : "",
        `</their_attempt>`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  if (pc.existing.length) {
    parts.push(
      `<existing_solutions>\n${pc.existing.map((s) => `v${s.version}: ${s.name} (time ${s.time}, space ${s.space})`).join("\n")}\n</existing_solutions>`,
    );
  }
  if (!buildsOnAttempt(pc.request.kind)) {
    parts.push(`<request>\n${SOLUTION_REQUEST_LABELS[pc.request.kind]}${pc.request.note ? `: ${pc.request.note}` : ""}\n</request>`);
  }
  return parts.join("\n\n");
}

function signatureBlock(h: ReadyHarness): string {
  const params = h.params.map((p) => `${p.name}: ${p.type}`).join(", ");
  return `<signature>\n${h.functionName}(${params}) -> ${h.returnType}${h.outputParam ? ` (changes ${h.outputParam} in place)` : ""}\n</signature>`;
}

/** The problem's fixed cases, in the shape the plan carries them. */
function harnessCases(h: ReadyHarness): SolutionPlan["testCases"] {
  return h.cases.map((c) => ({
    label: c.label,
    description: describeArgs(h.params, c.argsJson),
    argumentsJson: c.argsJson,
    expectedReturnJson: c.expectedJson,
  }));
}

/** Stage 1. With the problem's harness the cases are fixed: the model only writes the solution. */
async function solve(ctx: SolveCtx, pc: PlanContext, feedback = ""): Promise<SolutionPlan> {
  const h = ctx.harness;
  if (h) {
    const fixed = harnessCases(h);
    const cases = casesOf({ testCases: fixed } as SolutionPlan);
    const core = await generateStructured({
      model: ctx.model,
      meter: ctx.meter,
      signal: ctx.signal,
      name: "solution",
      schema: solutionPlanCoreSchema,
      instructions: instr(ctx, solveRole(true)),
      prompt: `${planPrompt(ctx, pc)}\n\n${signatureBlock(h)}\n\n${casesBlock(cases)}${
        feedback ? `\n\n<previous_solution_failed>\n${feedback}\n</previous_solution_failed>` : ""
      }`,
      maxOutputTokens: 12_000,
      check: (p) => {
        const issues: string[] = [];
        if (!p.codeLines.length) issues.push("- codeLines is empty");
        if (p.codeLines.length > 200) issues.push("- codeLines is too long; keep the solution under 200 lines");
        const outside = p.lineNotes.filter((n) => n.line < 0 || n.line >= p.codeLines.length).map((n) => n.line);
        if (outside.length) issues.push(`- lineNotes lines ${outside.join(", ")} are outside codeLines`);
        return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: p };
      },
    });
    return { ...core, testCases: fixed };
  }
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "solution",
    schema: solutionPlanSchema,
    instructions: instr(ctx, solveRole(false)),
    prompt: `${planPrompt(ctx, pc)}${feedback ? `\n\n<previous_solution_failed>\n${feedback}\n</previous_solution_failed>` : ""}`,
    maxOutputTokens: 12_000,
    check: (p) => {
      const issues: string[] = [];
      if (!p.codeLines.length) issues.push("- codeLines is empty");
      if (p.codeLines.length > 200) issues.push("- codeLines is too long; keep the solution under 200 lines");
      const outside = p.lineNotes.filter((n) => n.line < 0 || n.line >= p.codeLines.length).map((n) => n.line);
      if (outside.length) issues.push(`- lineNotes lines ${outside.join(", ")} are outside codeLines`);
      issues.push(...checkTestCases(p.testCases));
      p.testCases.forEach((c, i) => {
        try {
          JSON.parse(c.expectedReturnJson);
        } catch {
          issues.push(`- testCases[${i}].expectedReturnJson must be valid JSON`);
        }
      });
      return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: p };
    },
  });
}

/** Shows the approach the solve stage settled on and the cases it picked, all waiting to run. */
function showPlan(ctx: SolveCtx, plan: SolutionPlan) {
  const cases = casesOf(plan);
  ctx.progress.update((p) => {
    p.approach = plan.summary || plan.name;
    p.plan = { name: plan.name, time: plan.timeComplexity, space: plan.spaceComplexity };
    p.cases = cases.map((c) => ({ id: c.id, label: c.label, description: c.description, expected: c.expected, state: "pending" }));
    delete p.program;
    delete p.simulating;
    delete p.reworking;
  });
}

// Stage 2: trace ------------------------------------------------------------

type CaseRun = AutoRun & { matched: boolean | undefined };
type Execution = { loops: Loop[]; runs: (CaseRun | null)[] };

/** A case counts as matched unless its answer was checked and differs. */
const ok = (r: CaseRun | null) => Boolean(r) && r!.matched !== false;
const matchedShare = (e: Execution) => e.runs.filter(ok).length / e.runs.length;
const allMatched = (e: Execution) => e.runs.every(ok);

/** What run(input) hands back, as the harness types it: the return value, or the argument changed in place. */
function answerType(h: ReadyHarness | undefined): ValueType | undefined {
  if (!h) return undefined;
  const t = parseType(h.outputParam ? (h.params.find((p) => p.name === h.outputParam)?.type ?? "") : h.returnType);
  return t ?? undefined;
}

/** Whether a run returned the case's answer: the harness's comparison when there is one, else loosely. */
function matches(ctx: SolveCtx, c: PipelineCase, result: SandboxResult): boolean | undefined {
  if (result.outcome !== "ok") return false;
  const h = ctx.harness;
  if (h && result.returnJson !== null) {
    try {
      return sameAnswer(h.compare, JSON.parse(result.returnJson), JSON.parse(c.expected)) ?? undefined;
    } catch {
      return false;
    }
  }
  return sameResult(result.returnValue, c.expected);
}

/**
 * A JavaScript or TypeScript solution runs as it is: types stripped (sucrase keeps line numbers), every
 * statement traced on its own line, and a run(input) that builds the arguments the harness's way. No
 * translation call. Null when that's not possible (another language, no harness, code that doesn't parse
 * or has no function to call), and the caller translates instead.
 */
async function directProgram(ctx: SolveCtx, plan: SolutionPlan): Promise<Program | null> {
  const h = ctx.harness;
  if (!h || (ctx.language !== "javascript" && ctx.language !== "typescript")) return null;
  let js = plan.codeLines.join("\n").replace(/^(\s*)export\s+(default\s+)?/gm, "$1");
  try {
    if (ctx.language === "typescript") {
      const { transform } = await import("sucrase");
      js = transform(js, { transforms: ["typescript"], disableESTransforms: true }).code;
    }
    const defs = jsDefinitions(parseProgram(js).ast);
    if (defs.some((d) => d.name === "run")) return null;
    const found = resolveEntry(defs, h.functionName, h.params.map((p) => p.name));
    if ("error" in found) return null;
    const fn = found.entry.method
      ? `(function () { var s = new Solution(); return s.${found.entry.name}.bind(s); })()`
      : found.entry.name;
    const types = h.params.map((p) => ({ name: p.name, type: parseType(p.type) }));
    const out = h.outputParam ? h.params.findIndex((p) => p.name === h.outputParam) : -1;
    const adapter = `
function run(input) {
  var __args = ${JSON.stringify(types)}.map(function (p) { return __hIn(p.type, input[p.name]); });
  var __r = (${fn}).apply(null, __args);
  return ${out >= 0 ? `__args[${out}]` : "__r"};
}`;
    const lines = plan.codeLines.length;
    const inst = instrumentJs(`${js}\n${adapter}`, { lineFor: (l) => (l - 1 < lines ? l - 1 : null), hiddenFunctions: ["run"] });
    return {
      codeLines: plan.codeLines,
      addedLines: [],
      program: inst.program,
      decl: { structures: [], pointers: [] },
      loops: inst.loops.map((l) => ({ ...l, label: (plan.codeLines[l.line] ?? "").trim().slice(0, 40) || l.id })),
    };
  } catch (err) {
    ctx.meter.note(`solution couldn't run as is: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function translate(ctx: SolveCtx, plan: SolutionPlan, cases: PipelineCase[], feedback: string): Promise<Program> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "solution program",
    schema: solutionTranslationSchema,
    instructions: instr(ctx, SOLUTION_TRANSLATE_ROLE),
    prompt: `<problem>\n${ctx.statement}\n</problem>\n\n${codeBlock(plan)}\n\n${casesBlock(cases)}${
      feedback ? `\n\n<previous_program_failed>\n${feedback}\n</previous_program_failed>` : ""
    }`,
    maxOutputTokens: 12_000,
    check: (t) => {
      const { program, issues } = prepareProgram({ ...t, codeLines: plan.codeLines, addedLines: [] });
      return program ? { ok: true, value: program } : { ok: false, issues: issues.join("\n") };
    },
  });
}

/**
 * Runs the solution on every case, without narration: as it is when it's JavaScript or TypeScript,
 * otherwise through a plain-JS translation that's traced automatically. Returns null when execution
 * isn't usable so the caller can fall back to simulation. A translation that doesn't load, or disagrees
 * with an expected value, gets one more try; the run that matched more cases is returned. Cases that
 * recorded no steps are null runs, to be simulated.
 */
async function executeAll(ctx: SolveCtx, plan: SolutionPlan): Promise<Execution | null> {
  const cases = casesOf(plan);
  const lineCount = plan.codeLines.length;
  const returnType = answerType(ctx.harness);
  let feedback = "";
  let best: Execution | null = null;

  const runIt = async (p: Program) => {
    ctx.progress.update((pr) => {
      pr.program = { lines: lineCount, added: 0 };
      for (const c of pr.cases ?? []) c.state = "running";
    });
    const { runs, problem } = await runProgram(p, cases, returnType);
    if (problem) return { problem, execution: null };
    const execution: Execution = {
      loops: p.loops,
      runs: runs.map((r, i) => (r ? { ...r, matched: matches(ctx, cases[i], r.result) } : null)),
    };
    return { problem: null, execution };
  };

  const direct = await directProgram(ctx, plan);
  if (direct) {
    const { problem, execution } = await runIt(direct);
    if (execution) {
      ctx.meter.note("ran the solution as written (no translation)");
      // As written, a wrong answer is the solution's own: no translation can fix that, a re-solve can.
      return execution;
    }
    ctx.meter.note(`running the solution as written failed: ${problem}`);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    let p: Program;
    try {
      p = await translate(ctx, plan, cases, feedback);
    } catch (err) {
      if (err instanceof PipelineError && err.code === "invalid_output") return best;
      throw err;
    }
    const { problem, execution } = await runIt(p);
    // Shows the cases waiting for a rebuilt program, unless this was the last try.
    const rebuilding = () => {
      if (attempt > 0) return;
      ctx.progress.update((pr) => {
        pr.program = { lines: lineCount, added: 0, retrying: true };
        for (const c of pr.cases ?? []) {
          c.state = "pending";
          delete c.actual;
        }
      });
    };
    if (!execution) {
      ctx.meter.note(`solution program ${attempt + 1} rejected: ${problem}`);
      rebuilding();
      feedback = problem!;
      continue;
    }
    if (!best || matchedShare(execution) > matchedShare(best)) best = execution;
    if (allMatched(execution)) return execution;
    rebuilding();
    feedback = `${mismatches(cases, execution)}\nCheck that the program follows <solution_code> exactly and builds its input from the arguments it's given.`;
  }
  return best;
}

/** The cases a run got wrong, for retry prompts. */
function mismatches(cases: PipelineCase[], e: Execution): string {
  return cases
    .map((c, i) => {
      const run = e.runs[i];
      if (ok(run)) return null;
      const got = run ? shownOutput(run.result) : "reached no marked statement";
      return `- ${c.id} (${c.description}): got ${got}, expected ${c.expected}`;
    })
    .filter(Boolean)
    .join("\n");
}

async function narrate(ctx: SolveCtx, plan: SolutionPlan, c: PipelineCase, steps: Step[], result: SandboxResult): Promise<Step[]> {
  const ids = steps.map((s) => s.id);
  const narration = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "step narration",
    schema: narrationSchema,
    instructions: instr(ctx, SOLUTION_NARRATE_ROLE),
    prompt: `<problem>\n${ctx.statement}\n</problem>\n\n<approach>${plan.name}: ${plan.summary}\nKey ideas: ${plan.keyIdeas.join("; ")}</approach>\n\n${codeBlock(
      plan,
    )}\n\n${caseBlock(c)}\n\n<run_result>${
      result.outcome === "ok" ? `returned ${result.returnValue}` : runNoteFor(result)
    }</run_result>\n\n<trace note="line numbers here are 1-based">\n${describeSteps(steps, plan.codeLines)}\n</trace>\n\nNarrate every step id: ${ids.join(", ")}.`,
    maxOutputTokens: 16_000,
    check: (n) => {
      const got = new Set(n.steps.map((s) => s.id));
      const missing = ids.filter((id) => !got.has(id));
      if (missing.length > Math.max(2, ids.length * 0.1)) {
        return { ok: false, issues: `- missing narration for step ids: ${missing.slice(0, 30).join(", ")}` };
      }
      return { ok: true, value: n };
    },
  });
  const byId = new Map(narration.steps.map((s) => [s.id, s]));
  return steps.map((s) => {
    const n = byId.get(s.id);
    if (!n || s.title.startsWith("…iterations")) return s;
    return { ...s, title: n.title.slice(0, 120) || s.title, explanation: n.explanation.slice(0, 600) };
  });
}

/** Fallback: the model simulates the solution by hand on one case. */
function traceBySimulation(ctx: SolveCtx, plan: SolutionPlan, c: PipelineCase): Promise<CaseTrace> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    signal: ctx.signal,
    name: "simulated trace",
    schema: simulationSchema,
    instructions: instr(ctx, SOLUTION_SIMULATE_ROLE),
    prompt: `<problem>\n${ctx.statement}\n</problem>\n\n${codeBlock(plan)}\n\n${caseBlock(c)}`,
    maxOutputTokens: 32_000,
    check: (sim) => {
      // Line numbers must point into the plan's code, whatever the model copied back.
      const fixed = { ...sim, codeLines: plan.codeLines, addedLines: [] };
      const { steps, issues } = simulationToSteps(fixed);
      const all = [...checkDeclarations(fixed), ...issues];
      const shape = checkCaseShape(fixed, { structures: sim.structures, loops: sim.loops, steps });
      if (shape) all.push(shape);
      if (all.length) return { ok: false, issues: all.slice(0, 20).join("\n") };
      return {
        ok: true,
        value: {
          ...c,
          mode: "simulation" as const,
          structures: sim.structures,
          loops: sim.loops,
          steps: prefixStepIds(
            c.id,
            steps.map((s) => ({ ...s, isBugMoment: undefined })),
          ),
          actualOutput: sim.actualOutput,
        },
      };
    },
  });
}

/** Every case's walkthrough: narrated runs where execution worked, simulations elsewhere, in parallel. */
function traceCases(ctx: SolveCtx, plan: SolutionPlan, exec: Execution | null): Promise<CaseTrace[]> {
  const finished = (t: CaseTrace) => {
    ctx.progress.updateCase(t.id, { state: "done", actual: t.actualOutput, steps: t.steps.length });
    return t;
  };
  // Cases the program couldn't trace are simulated by hand; with none traced, that's all of them.
  if (!exec) {
    ctx.progress.update((p) => {
      p.simulating = true;
      delete p.program;
      for (const c of p.cases ?? []) c.state = "simulating";
    });
  }
  return Promise.all(
    casesOf(plan).map(async (c, i): Promise<CaseTrace> => {
      const run = exec?.runs[i];
      if (!exec || !run) {
        ctx.progress.updateCase(c.id, { state: "simulating" });
        return finished(await traceBySimulation(ctx, plan, c));
      }
      const steps = prefixStepIds(c.id, collapseSteps(run.steps, exec.loops));
      const actualOutput = shownOutput(run.result);
      ctx.progress.updateCase(c.id, { state: "explaining", actual: actualOutput, steps: steps.length });
      return finished({
        ...c,
        mode: "execution",
        structures: run.structures,
        loops: exec.loops,
        steps: await narrate(ctx, plan, c, steps, run.result),
        actualOutput,
        passed: run.matched,
      });
    }),
  );
}

function assemble(plan: SolutionPlan, cases: CaseTrace[]): VizSpec {
  return {
    version: 2,
    summary: { understoodApproach: (plan.summary || plan.name).slice(0, 1200), verdict: "works" },
    codeLines: plan.codeLines.map((l) => l.slice(0, 300)),
    cases: cases.map((c) => ({
      id: c.id,
      label: c.label.slice(0, 60),
      input: c.description.slice(0, 600) || "-",
      expectedOutput: c.expected.slice(0, 400),
      actualOutput: c.actualOutput.slice(0, 400),
      ...(c.passed !== undefined && { passed: c.passed }),
      structures: c.structures,
      loops: c.loops,
      steps: c.steps,
    })),
    diagnosis: { whatGoesWrong: "", whyItGoesWrong: "", bugStepIds: [], thinkingHints: [] },
  };
}

function toContent(plan: SolutionPlan, verified: boolean, reference: Reference | null): SolutionContent {
  return solutionContentSchema.parse({
    name: plan.name.slice(0, 120) || "Solution",
    summary: plan.summary.slice(0, 1500),
    relationToAttempt: plan.relationToAttempt.slice(0, 1500),
    keyIdeas: plan.keyIdeas.slice(0, 6).map((k) => k.slice(0, 500)),
    whyItWorks: plan.whyItWorks.slice(0, 2000),
    complexity: {
      time: plan.timeComplexity.slice(0, 60),
      space: plan.spaceComplexity.slice(0, 60),
      explanation: plan.complexityExplanation.slice(0, 1200),
    },
    codeLines: plan.codeLines.map((l) => l.slice(0, 300)),
    lineNotes: plan.lineNotes
      .filter((n) => n.line >= 0 && n.line < plan.codeLines.length && n.note.trim())
      .map((n) => ({ line: n.line, note: n.note.slice(0, 600) })),
    verified,
    ...(reference?.sources.length && { references: reference.sources.slice(0, 5) }),
  });
}

// Runner --------------------------------------------------------------------

/** Also where a stop lands: the signal is checked, and a solution the cancel route already removed ends the run. */
async function setStatus(solutionId: string, status: SolutionStatus, signal: AbortSignal) {
  throwIfCancelled(signal);
  const { matchedCount } = await Solution.updateOne({ _id: solutionId }, { $set: { status } });
  if (!matchedCount) throw new RunCancelledError();
  emit(solutionId, { type: "status", status });
}

/**
 * Generates one solution, persisting status after every stage and emitting
 * it for the events route. Never throws: a failure is stored on the solution
 * and emitted.
 */
export async function runSolutionPipeline(solutionId: string): Promise<void> {
  await connectDB();
  const solution = await Solution.findById(solutionId);
  if (!solution) return;
  const meter = new UsageMeter();
  const signal = startRun(solutionId);
  const stage = (status: SolutionStatus) => {
    meter.stage(status);
    return setStatus(solutionId, status, signal);
  };
  // Only while it's still running, so a late snapshot can't land on a finished or removed solution.
  const progress = new ProgressTracker(async (snapshot) => {
    await Solution.updateOne({ _id: solutionId, status: { $nin: ["done", "error"] } }, { $set: { progress: snapshot } });
    emit(solutionId, { type: "progress", progress: snapshot });
  });

  try {
    const [problem, user, attempt, existing] = await Promise.all([
      Problem.findOne({ _id: solution.problemId, userId: solution.userId }).lean(),
      User.findById(solution.userId).lean(),
      solution.basedOnAttemptId
        ? Attempt.findOne({ _id: solution.basedOnAttemptId, userId: solution.userId }).lean()
        : Promise.resolve(null),
      Solution.find({ problemId: solution.problemId, userId: solution.userId, status: "done", _id: { $ne: solution._id } })
        .sort({ version: 1 })
        .select({ version: 1, "content.name": 1, "content.complexity": 1 })
        .lean(),
    ]);
    if (!problem || !user) throw new PipelineError("not_found", "This problem no longer exists.");

    const { model } = getModel(user, "reasoning");
    const [source, reference] = await abortable(
      Promise.all([
        ensureProblemSource(problem),
        ensureProblemReference(problem, solution.language, userSearchKey(user)),
      ]),
      signal,
    );
    const ctx: SolveCtx = {
      model,
      meter,
      language: solution.language,
      statement: problem.statement,
      source,
      reference,
      signal,
      progress,
      ...(isReady(problem.harness) && { harness: problem.harness }),
    };
    if (ctx.harness) meter.note(`fixed cases from the problem's harness (${ctx.harness.cases.length})`);
    const pc: PlanContext = {
      attempt: attempt
        ? {
            version: attempt.version,
            pseudoCode: attempt.pseudoCode,
            idea: attempt.idea ?? "",
            spec: await loadSpec(attempt.specVersions?.at(-1) ?? attempt).catch(() => null),
          }
        : undefined,
      // A fixed attempt is built like a first solution: from the attempt, not as a variant of the others.
      existing: (buildsOnAttempt(solution.request?.kind ?? "initial") ? [] : existing).map((s) => {
        const c = s.content as Partial<SolutionContent> | undefined;
        return { version: s.version, name: c?.name ?? "?", time: c?.complexity?.time ?? "?", space: c?.complexity?.space ?? "?" };
      }),
      request: { kind: solution.request?.kind ?? "initial", note: solution.request?.note ?? "" },
    };

    await stage("solving");
    let plan = await solve(ctx, pc);
    showPlan(ctx, plan);

    await stage("tracing");
    let exec = await executeAll(ctx, plan);
    if (exec && !allMatched(exec)) {
      // Even a faithful program disagrees, so the code itself may be wrong: ask for a fix once and keep
      // whichever version gets more cases right.
      progress.update((p) => void (p.reworking = true));
      const retryPlan = await solve(
        ctx,
        pc,
        ctx.harness
          ? `Running your solution gave wrong answers; the expected answers have been checked:\n${mismatches(casesOf(plan), exec)}\nFix the solution.`
          : `Running your solution gave results that differ from the ones you said it returns:\n${mismatches(casesOf(plan), exec)}\nFix the solution (or an expected value if that was wrong).`,
      );
      showPlan(ctx, retryPlan);
      const retry = await executeAll(ctx, retryPlan);
      if (retry && (allMatched(retry) || matchedShare(retry) > matchedShare(exec))) {
        plan = retryPlan;
        exec = retry;
      }
      // Back to the version being kept, whichever it is.
      showPlan(ctx, plan);
    }

    await stage("narrating");
    const cases = await traceCases(ctx, plan, exec);
    // A simulation has nothing to check against; only a run that disagreed counts as unverified.
    const verified = cases.every((c) => c.passed !== false);
    const mode = cases.every((c) => c.mode === "execution") ? "execution" : "simulation";

    const parsed = vizSpecSchema.safeParse(assemble(plan, cases));
    if (!parsed.success) {
      console.error("[solution] assembled spec invalid:", formatSpecIssues(parsed.error, 5));
      throw new PipelineError("invalid_output", "The walkthrough came out malformed. Please try again.");
    }
    throwIfCancelled(signal);
    const content = toContent(plan, verified, ctx.reference);
    const stored = await storeSpec(
      String(solution.userId),
      String(solution.problemId),
      `solution-${solutionId}`,
      1,
      parsed.data,
    );

    await progress.flush();
    const stats = meter.report();
    console.info(formatRunStats(`[solution] ${solutionId} done (${mode})`, stats));

    await Solution.updateOne(
      { _id: solutionId },
      {
        $set: { status: "done", content, traceMode: mode, ...stored, tokenUsage: meter.snapshot(), runStats: stats },
        $unset: { progress: 1 },
      },
    );
    // The key worked, so it's no longer one the provider refused.
    await clearKeyRejected(user.ai?.keyId).catch(() => {});
    emit(solutionId, { type: "done" });
  } catch (err) {
    const stats = meter.report();
    console.info(formatRunStats(`[solution] ${solutionId} ended with ${err instanceof PipelineError ? err.code : "error"}`, stats));
    // A failed run doesn't use up the learner's hourly allowance, so they can retry with another model.
    await rateLimits.solutions().refund(String(solution.userId)).catch(() => {});
    if (err instanceof RunCancelledError) {
      // A stopped run leaves nothing behind: no failed version to retry, no version number taken.
      await deleteSolutionCascade(String(solution.userId), solution).catch((e) => {
        console.error(`[solution] couldn't discard stopped ${solutionId}:`, e instanceof Error ? e.message : e);
      });
      emit(solutionId, { type: "error", code: err.code, message: err.message });
      return;
    }
    const safe =
      err instanceof PipelineError || err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: "internal", message: "Something went wrong while writing the solution. Please try again." };
    if (!(err instanceof PipelineError || err instanceof ApiError)) {
      console.error(`[solution] ${solutionId} failed:`, err instanceof Error ? err.message : err);
    }
    // Flag a refused key so Settings can point at it.
    if (safe.code === "invalid_key") await markMainKeyRejected(solution.userId).catch(() => {});
    await progress.flush();
    await Solution.updateOne(
      { _id: solutionId },
      { $set: { status: "error", error: safe, tokenUsage: meter.snapshot(), runStats: stats }, $unset: { progress: 1 } },
    ).catch(() => {});
    emit(solutionId, { type: "error", ...safe });
  } finally {
    endRun(solutionId);
  }
}
