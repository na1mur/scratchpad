import "server-only";
import type { LanguageModel } from "ai";
import { ApiError } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import { LESSON_INSTRUCTIONS, LESSON_ROLE } from "@/lib/ai/prompts/lesson";
import {
  MAX_FRAMES,
  MAX_LESSON_CASES,
  MAX_SLIDES,
  lessonDraftSchema,
  lessonSpecSchema,
  looksLikeCode,
  type LessonCase,
  type LessonDraft,
  type LessonSpec,
  type Slide,
} from "@/lib/ai/schemas/lesson";
import type { SolutionContent } from "@/lib/ai/schemas/solution";
import { caseView, type VizSpec } from "@/lib/ai/schemas/vizSpec";
import { isReady } from "@/lib/harness/types";
import { connectDB } from "@/lib/db";
import { deleteLesson, storeLessonSpec } from "@/lib/lessons";
import { ensureProblemReference } from "@/lib/problemReference";
import { ensureProblemSource } from "@/lib/problemSource";
import { clearKeyRejected, markMainKeyRejected } from "@/lib/providerKeys";
import { rateLimits } from "@/lib/rateLimit";
import { loadSpec } from "@/lib/specStorage";
import { userSearchKey } from "@/lib/tavily";
import { withStableIds } from "@/lib/viz/prepare";
import { Lesson, type LessonStatus } from "@/models/Lesson";
import { Problem } from "@/models/Problem";
import { Solution } from "@/models/Solution";
import { User } from "@/models/User";
import { endRun, startRun } from "./cancel";
import {
  MAX_FIX_RETRIES,
  PipelineError,
  RunCancelledError,
  UsageMeter,
  abortable,
  formatRunStats,
  generateStructured,
  throwIfCancelled,
} from "./llm";
import { ProgressTracker } from "./progress";
import { assemble, solveAndRun, toContent, traceCases, type SolveCtx } from "./solution";
import { describeSteps } from "./steps";

/** What the deck teaches: a solution's explanation and its traced walkthrough. */
type Basis = { content: SolutionContent; spec: VizSpec };

// Stage 1 (only without a finished solution): work one out ----------------

/**
 * Writes and runs a solution the way the solution pipeline does, but in JavaScript (it's never shown, and
 * with the problem's harness it runs as written) and without saving it as one of the learner's solutions.
 */
async function workOutSolution(ctx: SolveCtx, stage: (s: LessonStatus) => Promise<void>): Promise<Basis> {
  await stage("solving");
  const { plan, exec } = await solveAndRun(ctx, { existing: [], request: { kind: "initial", note: "" } }, () => stage("tracing"));
  // The captions are written with the slides, so the runs aren't narrated.
  const cases = await traceCases(ctx, plan, exec, { narrate: false, limit: MAX_LESSON_CASES });
  return { content: toContent(plan, cases.every((c) => c.passed !== false), null), spec: assemble(plan, cases) };
}

// Stage 2: write the slides ------------------------------------------------

function lessonPrompt(statement: string, { content, spec }: Basis): string {
  const cases = spec.cases.slice(0, MAX_LESSON_CASES);
  return [
    `<problem>\n${statement}\n</problem>`,
    `<approach name="${content.name}" time="${content.complexity.time}" space="${content.complexity.space}">`,
    content.summary,
    `Key ideas:\n${content.keyIdeas.map((k) => `- ${k}`).join("\n")}`,
    `Why it works: ${content.whyItWorks}`,
    `Complexity: ${content.complexity.explanation}`,
    `</approach>`,
    `<solution_code note="for your understanding only; never put code on a slide">\n${spec.codeLines.join("\n")}\n</solution_code>`,
    ...cases.map((c) =>
      [
        `<case id="${c.id}" label="${c.label}">`,
        `input: ${c.input}`,
        `expected answer: ${c.expectedOutput}`,
        `pictures show: ${c.structures.map((s) => `${s.id} (${s.kind}, "${s.label}")`).join(", ")}`,
        `steps (${c.steps.length}, ids ${c.steps[0].id} … ${c.steps.at(-1)!.id}):`,
        describeSteps(c.steps, spec.codeLines, 9_000),
        `</case>`,
      ].join("\n"),
    ),
  ].join("\n\n");
}

const clip = (s: string, max: number) => s.trim().slice(0, max);

/** One drafted slide in its stored shape, or what's wrong with its references. */
function toSlide(
  d: LessonDraft["slides"][number],
  basis: Basis,
  cases: Map<string, VizSpec["cases"][number]>,
  indexOf: (caseId: string, stepId: string) => number,
): { slide?: Slide; issue?: string } {
  const base = { label: clip(d.label, 40), title: clip(d.title, 120) || "…" };
  if ((d.kind === "picture" || d.kind === "walk" || d.kind === "predict") && !cases.has(d.caseId)) {
    return { issue: `caseId "${d.caseId}" isn't one of ${[...cases.keys()].join(", ")}` };
  }
  switch (d.kind) {
    case "text":
      return { slide: { kind: "text", ...base, body: clip(d.body, 1200), points: d.points.slice(0, 8).map((p) => clip(p, 300)).filter(Boolean) } };
    case "pause":
      return { slide: { kind: "pause", ...base, body: clip(d.body, 800) } };
    case "cost": {
      const { time, space } = basis.content.complexity;
      return { slide: { kind: "cost", ...base, time, space, body: clip(d.body, 1200) } };
    }
    case "picture":
      if (indexOf(d.caseId, d.stepId) < 0) return { issue: `stepId "${d.stepId}" isn't a step of ${d.caseId}` };
      return { slide: { kind: "picture", ...base, body: clip(d.body, 800), caseId: d.caseId, stepId: d.stepId } };
    case "predict": {
      const ask = indexOf(d.caseId, d.stepId);
      const answer = indexOf(d.caseId, d.answerStepId);
      if (ask < 0 || answer < 0) return { issue: `stepId and answerStepId must both be steps of ${d.caseId}` };
      if (answer <= ask) return { issue: "answerStepId must come after stepId" };
      return {
        slide: {
          kind: "predict",
          ...base,
          question: clip(d.question, 400),
          answer: clip(d.answer, 800),
          caseId: d.caseId,
          stepId: d.stepId,
          answerStepId: d.answerStepId,
        },
      };
    }
    case "walk": {
      const unknown = d.frames.filter((f) => indexOf(d.caseId, f.stepId) < 0).map((f) => f.stepId);
      if (unknown.length) return { issue: `frames name steps that aren't in ${d.caseId}: ${unknown.slice(0, 8).join(", ")}` };
      const frames = d.frames
        .filter((f, i) => d.frames.findIndex((g) => g.stepId === f.stepId) === i)
        .sort((a, b) => indexOf(d.caseId, a.stepId) - indexOf(d.caseId, b.stepId))
        .map((f) => ({ stepId: f.stepId, caption: clip(f.caption, 400) }));
      if (frames.length < 2) return { issue: "a walk needs at least 2 frames" };
      if (frames.length > MAX_FRAMES) return { issue: `at most ${MAX_FRAMES} frames` };
      return { slide: { kind: "walk", ...base, body: clip(d.body, 600), caseId: d.caseId, frames } };
    }
  }
}

/**
 * Turns the model's flat slides into the stored union. Every slide is checked: step ids must exist in
 * their case and no text may read as code. With `lenient` (the last try) a slide that fails is dropped
 * instead of sending the whole deck back.
 */
function toSlides(draft: LessonDraft, basis: Basis, lenient: boolean): { slides: Slide[]; issues: string[] } {
  const cases = new Map(basis.spec.cases.slice(0, MAX_LESSON_CASES).map((c) => [c.id, c]));
  const indexOf = (caseId: string, stepId: string) => cases.get(caseId)?.steps.findIndex((s) => s.id === stepId) ?? -1;
  const issues: string[] = [];
  const slides: Slide[] = [];

  draft.slides.forEach((d, n) => {
    const { slide, issue } = toSlide(d, basis, cases, indexOf);
    const words = [d.label, d.title, d.body, d.question, d.answer, ...d.points, ...d.frames.map((f) => f.caption)];
    const code = words.find((w) => w && looksLikeCode(w));
    const at = `- slide ${n + 1} (${d.kind})`;
    if (issue) issues.push(`${at}: ${issue}`);
    if (code) issues.push(`${at} contains code-like text, which slides must never show: "${code.slice(0, 120)}". Say it in plain words.`);
    if (slide && !issue && !code) slides.push(slide);
  });

  if (draft.slides.length > MAX_SLIDES) issues.push(`- ${draft.slides.length} slides; keep it to ${MAX_SLIDES} at most`);
  if (!lenient) return { slides, issues };
  return { slides: slides.slice(0, MAX_SLIDES), issues: slides.length >= 3 ? [] : issues };
}

function writeSlides(model: LanguageModel, meter: UsageMeter, signal: AbortSignal, statement: string, basis: Basis) {
  let tries = 0;
  return generateStructured({
    model,
    meter,
    signal,
    // Shows in the "couldn't produce a valid …" error, so it uses the name learners see.
    name: "breakdown slides",
    schema: lessonDraftSchema,
    instructions: `${LESSON_INSTRUCTIONS}\n\n${LESSON_ROLE}`,
    prompt: lessonPrompt(statement, basis),
    maxOutputTokens: 12_000,
    check: (draft) => {
      tries++;
      const { slides, issues } = toSlides(draft, basis, tries > MAX_FIX_RETRIES);
      return issues.length ? { ok: false, issues: issues.slice(0, 20).join("\n") } : { ok: true, value: slides };
    },
  });
}

/**
 * The deck as stored: the slides plus, for every case they draw, only the states they use. Ids are made
 * stable over the whole run first, so items still glide between frames that skip steps. Lines and the
 * steps' own titles are dropped: they describe code.
 */
function assembleLesson(basis: Basis, slides: Slide[]): LessonSpec {
  const used = new Map<string, Set<string>>();
  for (const s of slides) {
    if (s.kind !== "picture" && s.kind !== "walk" && s.kind !== "predict") continue;
    const ids = used.get(s.caseId) ?? new Set<string>();
    if (s.kind === "walk") for (const f of s.frames) ids.add(f.stepId);
    else ids.add(s.stepId);
    if (s.kind === "predict") ids.add(s.answerStepId);
    used.set(s.caseId, ids);
  }
  const cases: LessonCase[] = basis.spec.cases.flatMap((c, i) => {
    const ids = used.get(c.id);
    if (!ids) return [];
    const stable = withStableIds(caseView(basis.spec, i));
    return [
      {
        id: c.id,
        label: c.label,
        input: c.input,
        expectedOutput: c.expectedOutput,
        structures: c.structures,
        steps: stable.steps
          .filter((s) => ids.has(s.id))
          .map((s) => ({
            id: s.id,
            line: null,
            title: "Step",
            explanation: "",
            states: s.states,
            ...(s.pointers && { pointers: s.pointers }),
            ...(s.highlights && { highlights: s.highlights }),
            ...(s.event && { event: s.event }),
          })),
      },
    ];
  });
  const { name, complexity } = basis.content;
  return { version: 1, approach: { name, time: complexity.time, space: complexity.space }, cases, slides };
}

// Runner --------------------------------------------------------------------

/** Also where a stop lands: the signal is checked, and a lesson the route already removed ends the run. */
async function setStatus(lessonId: string, status: LessonStatus, signal: AbortSignal) {
  throwIfCancelled(signal);
  const { matchedCount } = await Lesson.updateOne({ _id: lessonId }, { $set: { status } });
  if (!matchedCount) throw new RunCancelledError();
}

/**
 * Builds a problem's lesson, persisting status after every stage (the page polls it). Never throws: a
 * failure is stored on the lesson, and a stopped run removes it.
 */
export async function runLessonPipeline(lessonId: string): Promise<void> {
  await connectDB();
  const lesson = await Lesson.findById(lessonId);
  if (!lesson) return;
  const meter = new UsageMeter();
  const signal = startRun(lessonId);
  const stage = (status: LessonStatus) => {
    meter.stage(status);
    return setStatus(lessonId, status, signal);
  };
  const progress = new ProgressTracker((snapshot) =>
    Lesson.updateOne({ _id: lessonId, status: { $nin: ["done", "error"] } }, { $set: { progress: snapshot } }),
  );

  try {
    const [problem, user, solutions] = await Promise.all([
      Problem.findOne({ _id: lesson.problemId, userId: lesson.userId }).lean(),
      User.findById(lesson.userId).lean(),
      Solution.find({ problemId: lesson.problemId, userId: lesson.userId, status: "done" })
        .sort({ version: -1 })
        .select({ content: 1, vizSpec: 1, specKey: 1 })
        .lean(),
    ]);
    if (!problem || !user) throw new PipelineError("not_found", "This problem no longer exists.");
    const { model } = getModel(user, "reasoning");

    // The newest solution whose run checked out, else the newest one: its approach is already worked out and traced.
    const solution =
      solutions.find((s) => (s.content as SolutionContent | undefined)?.verified) ?? solutions[0] ?? null;
    const spec = solution ? await loadSpec(solution).catch(() => null) : null;
    let basis: Basis;
    if (solution && spec) {
      meter.note(`taught from solution ${solution._id}`);
      await Lesson.updateOne({ _id: lessonId }, { $set: { basedOnSolutionId: solution._id } });
      basis = { content: solution.content as SolutionContent, spec };
    } else {
      const [source, reference] = await abortable(
        Promise.all([ensureProblemSource(problem), ensureProblemReference(problem, "javascript", userSearchKey(user))]),
        signal,
      );
      const ctx: SolveCtx = {
        model,
        meter,
        language: "javascript",
        statement: problem.statement,
        source,
        reference,
        signal,
        progress,
        ...(isReady(problem.harness) && { harness: problem.harness }),
      };
      basis = await workOutSolution(ctx, stage);
    }

    await stage("writing");
    const slides = await writeSlides(model, meter, signal, problem.statement, basis);
    const parsed = lessonSpecSchema.safeParse(assembleLesson(basis, slides));
    if (!parsed.success) {
      console.error("[lesson] assembled lesson invalid:", parsed.error.issues.slice(0, 5));
      throw new PipelineError("invalid_output", "The slides came out malformed. Please try again.");
    }
    throwIfCancelled(signal);
    const stored = await storeLessonSpec(String(lesson.userId), String(lesson.problemId), lessonId, parsed.data);

    await progress.flush();
    const stats = meter.report();
    console.info(formatRunStats(`[lesson] ${lessonId} done`, stats));
    await Lesson.updateOne(
      { _id: lessonId },
      { $set: { status: "done", ...stored, tokenUsage: meter.snapshot(), runStats: stats }, $unset: { progress: 1 } },
    );
    await clearKeyRejected(user.ai?.keyId).catch(() => {});
  } catch (err) {
    const stats = meter.report();
    console.info(formatRunStats(`[lesson] ${lessonId} ended with ${err instanceof PipelineError ? err.code : "error"}`, stats));
    await rateLimits.lessons().refund(String(lesson.userId)).catch(() => {});
    if (err instanceof RunCancelledError) {
      await deleteLesson(String(lesson.userId), lesson).catch(() => {});
      return;
    }
    const safe =
      err instanceof PipelineError || err instanceof ApiError
        ? { code: err.code, message: err.message }
        : { code: "internal", message: "Something went wrong while building the breakdown. Please try again." };
    if (!(err instanceof PipelineError || err instanceof ApiError)) {
      console.error(`[lesson] ${lessonId} failed:`, err instanceof Error ? err.message : err);
    }
    if (safe.code === "invalid_key") await markMainKeyRejected(lesson.userId).catch(() => {});
    await progress.flush();
    await Lesson.updateOne(
      { _id: lessonId },
      { $set: { status: "error", error: safe, tokenUsage: meter.snapshot(), runStats: stats }, $unset: { progress: 1 } },
    ).catch(() => {});
  } finally {
    endRun(lessonId);
  }
}
