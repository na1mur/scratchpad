import "server-only";
import type { LanguageModel } from "ai";
import { ApiError } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import {
  SOLUTION_NARRATE_ROLE,
  SOLUTION_SIMULATE_ROLE,
  SOLUTION_TRANSLATE_ROLE,
  SOLVE_ROLE,
  solutionInstructions,
} from "@/lib/ai/prompts/solution";
import { referenceBlock, sourceBlock } from "@/lib/ai/prompts/system";
import { narrationSchema, simulationSchema } from "@/lib/ai/schemas/pipeline";
import {
  SOLUTION_REQUEST_LABELS,
  solutionContentSchema,
  solutionPlanSchema,
  solutionTranslationSchema,
  type SolutionContent,
  type SolutionPlan,
  type SolutionRequestKind,
} from "@/lib/ai/schemas/solution";
import { formatSpecIssues, vizSpecSchema, type Loop, type Step, type Structure, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { connectDB } from "@/lib/db";
import { ensureProblemReference, type Reference } from "@/lib/problemReference";
import { ensureProblemSource } from "@/lib/problemSource";
import { loadSpec, storeSpec } from "@/lib/specStorage";
import { rateLimits } from "@/lib/rateLimit";
import { Attempt } from "@/models/Attempt";
import { Problem } from "@/models/Problem";
import { Solution, type SolutionStatus } from "@/models/Solution";
import { User } from "@/models/User";
import { emit } from "./events";
import { PipelineError, UsageMeter, generateStructured } from "./llm";
import { runInSandbox, type SandboxResult } from "./sandbox";
import { checkDeclarations, runNoteFor, simulationToSteps } from "./stages";
import { collapseSteps, describeSteps, eventsToSteps } from "./steps";

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
};

type Trace = {
  mode: "execution" | "simulation";
  structures: Structure[];
  loops: Loop[];
  steps: Step[];
  actualOutput: string;
};

const instr = (ctx: SolveCtx, role: string) => solutionInstructions(ctx.language, role);

const numbered = (lines: string[]) => lines.map((l, i) => `${i}: ${l}`).join("\n");

function codeBlock(plan: SolutionPlan) {
  return `<solution_code note="0-based line numbers">\n${numbered(plan.codeLines)}\n</solution_code>`;
}

function inputBlock(plan: SolutionPlan) {
  return `<test_input>\n${plan.testInput.description}\narguments: ${plan.testInput.argumentsJson}\nexpected return: ${plan.expectedReturnJson}\n</test_input>`;
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
  if (pc.request.kind !== "initial") {
    parts.push(`<request>\n${SOLUTION_REQUEST_LABELS[pc.request.kind]}${pc.request.note ? `: ${pc.request.note}` : ""}\n</request>`);
  }
  return parts.join("\n\n");
}

function solve(ctx: SolveCtx, pc: PlanContext, feedback = ""): Promise<SolutionPlan> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "solution",
    schema: solutionPlanSchema,
    instructions: instr(ctx, SOLVE_ROLE),
    prompt: `${planPrompt(ctx, pc)}${feedback ? `\n\n<previous_solution_failed>\n${feedback}\n</previous_solution_failed>` : ""}`,
    maxOutputTokens: 12_000,
    check: (p) => {
      const issues: string[] = [];
      if (!p.codeLines.length) issues.push("- codeLines is empty");
      if (p.codeLines.length > 200) issues.push("- codeLines is too long; keep the solution under 200 lines");
      const outside = p.lineNotes.filter((n) => n.line < 0 || n.line >= p.codeLines.length).map((n) => n.line);
      if (outside.length) issues.push(`- lineNotes lines ${outside.join(", ")} are outside codeLines`);
      try {
        const args = JSON.parse(p.testInput.argumentsJson);
        if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error();
      } catch {
        issues.push("- testInput.argumentsJson must be a valid JSON object of named arguments");
      }
      try {
        JSON.parse(p.expectedReturnJson);
      } catch {
        issues.push("- expectedReturnJson must be valid JSON");
      }
      return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: p };
    },
  });
}

// Stage 2: trace ------------------------------------------------------------

type Run = { trace: Trace; result: SandboxResult; matched: boolean };

/**
 * Runs an instrumented copy of the solution, without narration. Returns null
 * when execution isn't usable so the caller can fall back to simulation.
 * A run whose result disagrees with the expected one gets one more
 * translation; if that doesn't help, the mismatched run is returned.
 */
async function traceByExecution(ctx: SolveCtx, plan: SolutionPlan): Promise<Run | null> {
  const args = JSON.parse(plan.testInput.argumentsJson);
  const lineCount = plan.codeLines.length;
  let feedback = "";
  let mismatched: Run | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    let t;
    try {
      t = await generateStructured({
        model: ctx.model,
        meter: ctx.meter,
        name: "instrumented solution",
        schema: solutionTranslationSchema,
        instructions: instr(ctx, SOLUTION_TRANSLATE_ROLE),
        prompt: `<problem>\n${ctx.statement}\n</problem>\n\n${codeBlock(plan)}\n\n${inputBlock(plan)}${
          feedback ? `\n\n<previous_program_failed>\n${feedback}\n</previous_program_failed>` : ""
        }`,
        maxOutputTokens: 12_000,
        check: (tr) => {
          const issues = checkDeclarations({ ...tr, codeLines: plan.codeLines, addedLines: [] });
          return issues.length ? { ok: false, issues: issues.join("\n") } : { ok: true, value: tr };
        },
      });
    } catch (err) {
      if (err instanceof PipelineError && err.code === "invalid_output") return mismatched;
      throw err;
    }

    const result = await runInSandbox(t.program, args);
    const { steps, problems } = eventsToSteps(result.events, t.structures, t.loops, lineCount);
    const broken =
      result.outcome === "invalid_program" ||
      steps.length === 0 ||
      problems.badStates > steps.length ||
      problems.unknownStructures.size > 0;
    if (broken) {
      feedback = [
        result.outcome === "invalid_program" ? `The program didn't load: ${result.errorMessage}` : null,
        steps.length === 0 ? `It made no trace() calls${result.errorMessage ? ` (${result.errorMessage})` : ""}.` : null,
        problems.unknownStructures.size
          ? `trace() used structure ids that aren't declared: ${[...problems.unknownStructures].join(", ")}`
          : null,
        problems.badStates ? `${problems.badStates} snapshots were malformed; build states only with the S.* helpers.` : null,
      ]
        .filter(Boolean)
        .join("\n");
      continue;
    }

    const run: Run = {
      trace: {
        mode: "execution",
        structures: t.structures,
        loops: t.loops,
        steps: collapseSteps(steps, t.loops),
        actualOutput: result.outcome === "ok" ? (result.returnValue ?? "undefined") : (runNoteFor(result) ?? "error"),
      },
      result,
      matched: result.outcome === "ok" && sameResult(result.returnValue, plan.expectedReturnJson),
    };
    if (run.matched) return run;
    mismatched = run;
    feedback = `The program ${
      result.outcome === "ok" ? `returned ${result.returnValue}` : (runNoteFor(result) ?? "failed")
    }, but the solution should return ${plan.expectedReturnJson}. Check that the program follows <solution_code> exactly.`;
  }
  return mismatched;
}

async function withNarration<T extends Trace>(ctx: SolveCtx, plan: SolutionPlan, trace: T, result: SandboxResult): Promise<T> {
  const ids = trace.steps.map((s) => s.id);
  const narration = await generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "step narration",
    schema: narrationSchema,
    instructions: instr(ctx, SOLUTION_NARRATE_ROLE),
    prompt: `<problem>\n${ctx.statement}\n</problem>\n\n<approach>${plan.name}: ${plan.summary}\nKey ideas: ${plan.keyIdeas.join("; ")}</approach>\n\n${codeBlock(
      plan,
    )}\n\n${inputBlock(plan)}\n\n<run_result>${
      result.outcome === "ok" ? `returned ${result.returnValue}` : runNoteFor(result)
    }</run_result>\n\n<trace note="line numbers here are 1-based">\n${describeSteps(trace.steps, plan.codeLines)}\n</trace>\n\nNarrate every step id: ${ids.join(", ")}.`,
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
  const steps = trace.steps.map((s) => {
    const n = byId.get(s.id);
    if (!n || s.title.startsWith("…iterations")) return s;
    return { ...s, title: n.title.slice(0, 120) || s.title, explanation: n.explanation.slice(0, 600) };
  });
  return { ...trace, steps };
}

/** Fallback: the model simulates the solution by hand. */
function traceBySimulation(ctx: SolveCtx, plan: SolutionPlan): Promise<Trace> {
  return generateStructured({
    model: ctx.model,
    meter: ctx.meter,
    name: "simulated trace",
    schema: simulationSchema,
    instructions: instr(ctx, SOLUTION_SIMULATE_ROLE),
    prompt: `<problem>\n${ctx.statement}\n</problem>\n\n${codeBlock(plan)}\n\n${inputBlock(plan)}`,
    maxOutputTokens: 32_000,
    check: (sim) => {
      // Line numbers must point into the plan's code, whatever the model copied back.
      const fixed = { ...sim, codeLines: plan.codeLines, addedLines: [] };
      const { steps, issues } = simulationToSteps(fixed);
      const all = [...checkDeclarations(fixed), ...issues];
      const probe = vizSpecSchema.safeParse(assemble(plan, { mode: "simulation", ...fixed, steps }));
      if (!probe.success) all.push(formatSpecIssues(probe.error));
      if (all.length) return { ok: false, issues: all.slice(0, 20).join("\n") };
      return {
        ok: true,
        value: {
          mode: "simulation" as const,
          structures: sim.structures,
          loops: sim.loops,
          steps: steps.map((s) => ({ ...s, isBugMoment: undefined })),
          actualOutput: sim.actualOutput,
        },
      };
    },
  });
}

function assemble(plan: SolutionPlan, trace: Trace): VizSpec {
  return {
    version: 1,
    summary: {
      understoodApproach: (plan.summary || plan.name).slice(0, 1200),
      verdict: "works",
      testInputDescription: plan.testInput.description.slice(0, 600) || "-",
      expectedOutput: plan.expectedReturnJson.slice(0, 400),
      actualOutput: trace.actualOutput.slice(0, 400),
    },
    codeLines: plan.codeLines.map((l) => l.slice(0, 300)),
    structures: trace.structures,
    loops: trace.loops,
    steps: trace.steps,
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

async function setStatus(solutionId: string, status: SolutionStatus) {
  await Solution.updateOne({ _id: solutionId }, { $set: { status } });
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
    const [source, reference] = await Promise.all([
      ensureProblemSource(problem),
      ensureProblemReference(problem, solution.language),
    ]);
    const ctx: SolveCtx = {
      model,
      meter,
      language: solution.language,
      statement: problem.statement,
      source,
      reference,
    };
    const pc: PlanContext = {
      attempt: attempt
        ? {
            version: attempt.version,
            pseudoCode: attempt.pseudoCode,
            idea: attempt.idea ?? "",
            spec: await loadSpec(attempt.specVersions?.at(-1) ?? attempt).catch(() => null),
          }
        : undefined,
      existing: existing.map((s) => {
        const c = s.content as Partial<SolutionContent> | undefined;
        return { version: s.version, name: c?.name ?? "?", time: c?.complexity?.time ?? "?", space: c?.complexity?.space ?? "?" };
      }),
      request: { kind: solution.request?.kind ?? "initial", note: solution.request?.note ?? "" },
    };

    await setStatus(solutionId, "solving");
    let plan = await solve(ctx, pc);

    await setStatus(solutionId, "tracing");
    let run = await traceByExecution(ctx, plan);
    if (run && !run.matched) {
      // Even a faithful program disagrees, so the code itself may be wrong: ask for a fix once and keep
      // whichever run checks out.
      const retryPlan = await solve(
        ctx,
        pc,
        `Running your solution on ${plan.testInput.description} returned ${run.trace.actualOutput}, but you said it returns ${plan.expectedReturnJson}. Fix the solution (or the expected value if that was wrong).`,
      );
      const retry = await traceByExecution(ctx, retryPlan);
      if (retry?.matched) {
        plan = retryPlan;
        run = retry;
      }
    }

    await setStatus(solutionId, "narrating");
    const finalTrace = run ? await withNarration(ctx, plan, run.trace, run.result) : await traceBySimulation(ctx, plan);
    // A simulation has nothing to check against; only a run that disagreed counts as unverified.
    const verified = run ? run.matched : true;

    const parsed = vizSpecSchema.safeParse(assemble(plan, finalTrace));
    if (!parsed.success) {
      console.error("[solution] assembled spec invalid:", formatSpecIssues(parsed.error, 5));
      throw new PipelineError("invalid_output", "The walkthrough came out malformed. Please try again.");
    }
    const content = toContent(plan, verified, ctx.reference);
    const stored = await storeSpec(
      String(solution.userId),
      String(solution.problemId),
      `solution-${solutionId}`,
      1,
      parsed.data,
    );

    await Solution.updateOne(
      { _id: solutionId },
      { $set: { status: "done", content, traceMode: finalTrace.mode, ...stored, tokenUsage: meter.snapshot() } },
    );
    emit(solutionId, { type: "done" });
  } catch (err) {
    const safe =
      err instanceof PipelineError || err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: "internal", message: "Something went wrong while writing the solution. Please try again." };
    if (!(err instanceof PipelineError || err instanceof ApiError)) {
      console.error(`[solution] ${solutionId} failed:`, err instanceof Error ? err.message : err);
    }
    // A failed run doesn't use up the learner's hourly allowance, so they can retry with another model.
    await rateLimits.solutions().refund(String(solution.userId)).catch(() => {});
    await Solution.updateOne({ _id: solutionId }, { $set: { status: "error", error: safe, tokenUsage: meter.snapshot() } }).catch(
      () => {},
    );
    emit(solutionId, { type: "error", ...safe });
  }
}
