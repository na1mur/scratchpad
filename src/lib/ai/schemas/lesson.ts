import { z } from "zod";
import { stepSchema, structureSchema } from "./vizSpec";

/**
 * Lessons: a slide deck that teaches how to think about a problem, with no code. The pictures are states
 * from a real run of a correct solution (a VizSpec trace), so the model only picks which states to show
 * and writes the words. Shared by server and client; the renderers in src/components/lesson/ consume only
 * this.
 */

export const MAX_SLIDES = 16;
export const MAX_FRAMES = 14;
export const MAX_LESSON_CASES = 3;

const text = (max: number) => z.string().max(max);

/** One input the deck draws, with only the states its slides use (lines dropped, so nothing points at code). */
export const lessonCaseSchema = z.object({
  id: z.string().min(1).max(64),
  label: text(60),
  input: text(600),
  expectedOutput: text(400),
  structures: z.array(structureSchema).min(1).max(8),
  steps: z.array(stepSchema).min(1).max(120),
});
export type LessonCase = z.infer<typeof lessonCaseSchema>;

const base = {
  /** Short eyebrow above the title, e.g. "The problem" or "Key idea". */
  label: text(40),
  title: text(120),
};

/** A picture of one state: which case, which step of it. */
const at = { caseId: z.string(), stepId: z.string() };

export const frameSchema = z.object({ stepId: z.string(), caption: text(400) });
export type Frame = z.infer<typeof frameSchema>;

export const slideSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), ...base, body: text(1200), points: z.array(text(300)).max(8) }),
  z.object({ kind: z.literal("picture"), ...base, body: text(800), ...at }),
  z.object({
    kind: z.literal("walk"),
    ...base,
    body: text(600),
    caseId: z.string(),
    frames: z.array(frameSchema).min(2).max(MAX_FRAMES),
  }),
  z.object({
    kind: z.literal("predict"),
    ...base,
    question: text(400),
    answer: text(800),
    ...at,
    answerStepId: z.string(),
  }),
  /** A checkpoint that invites the learner to try it themselves before reading on. */
  z.object({ kind: z.literal("pause"), ...base, body: text(800) }),
  z.object({ kind: z.literal("cost"), ...base, time: text(60), space: text(60), body: text(1200) }),
]);
export type Slide = z.infer<typeof slideSchema>;
export type SlideKind = Slide["kind"];

export const lessonSpecSchema = z.object({
  version: z.literal(1),
  /** The approach the deck teaches. */
  approach: z.object({ name: text(120), time: text(60), space: text(60) }),
  cases: z.array(lessonCaseSchema).min(1).max(MAX_LESSON_CASES),
  slides: z.array(slideSchema).min(1).max(MAX_SLIDES + 4),
});
export type LessonSpec = z.infer<typeof lessonSpecSchema>;

// Model-facing ---------------------------------------------------------------

export const LESSON_SLIDE_KINDS = ["text", "picture", "walk", "predict", "pause", "cost"] as const;

/** Flat, so every provider's structured output can take it; converted by `toSlides()` on the server. */
export const lessonDraftSchema = z.object({
  slides: z
    .array(
      z.object({
        kind: z.enum(LESSON_SLIDE_KINDS),
        label: z.string().describe("Short eyebrow above the title, 1–3 words, e.g. 'The problem', 'Key idea', 'Your turn'."),
        title: z.string().describe("The slide's headline, at most ~10 words."),
        body: z.string().describe("1–3 short sentences. '' for predict slides."),
        points: z.array(z.string()).describe("text slides: 2–6 short bullet points (may be empty). [] for other kinds."),
        caseId: z.string().describe("picture, walk and predict slides: the case drawn. '' otherwise."),
        stepId: z.string().describe("picture and predict slides: the step id whose state is drawn. '' otherwise."),
        frames: z
          .array(z.object({ stepId: z.string(), caption: z.string() }))
          .describe("walk slides: 3–12 step ids of caseId in order, each with a 1–2 sentence caption. [] otherwise."),
        question: z.string().describe("predict slides: what the learner should predict. '' otherwise."),
        answer: z.string().describe("predict slides: the answer and why, 1–3 sentences. '' otherwise."),
        answerStepId: z.string().describe("predict slides: a later step of the same case that shows the answer. '' otherwise."),
      }),
    )
    .describe("The deck, in order."),
});
export type LessonDraft = z.infer<typeof lessonDraftSchema>;

/**
 * Text that reads as code rather than prose: statement punctuation, arrows, keywords followed by code,
 * indexing into a name. Plain math such as "i + 1" or "O(n log n)" passes.
 */
export function looksLikeCode(s: string): boolean {
  return [
    /[;{}]\s*$/m,
    /=>|===|!==|\+\+|&&|\|\|/,
    /\b(def|function|func|fn)\s+\w+\s*\(/,
    /\b(const|let|var|int)\s+\w+\s*=/,
    /\b(for|while|if)\s*\(.*\)\s*[{:]/,
    /\belif\b|\blambda\b|\bnew\s+[A-Z]\w*\(/,
    /\b\w+\[[^\]\s]+\]\s*[-+*/]?=[^=]/,
    /```/,
  ].some((re) => re.test(s));
}
