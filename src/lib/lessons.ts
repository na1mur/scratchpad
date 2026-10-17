import "server-only";
import type { Types } from "mongoose";
import type { LessonSpec } from "@/lib/ai/schemas/lesson";
import { connectDB } from "@/lib/db";
import type { RunProgress } from "@/lib/runProgress";
import { deleteKeys, getJson, putJson, storageEnabled } from "@/lib/storage";
import { Lesson, type LessonDoc, type LessonStatus } from "@/models/Lesson";

export const LESSON_IN_PROGRESS: ReadonlySet<LessonStatus> = new Set(["queued", "solving", "tracing", "writing"]);

// A pipeline that hasn't touched its lesson for this long died with the server process.
const STALE_AFTER_MS = 15 * 60_000;

/** The problem's lesson, or null. A run that died is marked failed on the way. */
export async function getProblemLesson(userId: string, problemId: Types.ObjectId | string): Promise<LessonDoc | null> {
  await connectDB();
  const lesson = await Lesson.findOne({ problemId, userId }).lean();
  if (!lesson) return null;
  if (LESSON_IN_PROGRESS.has(lesson.status) && Date.now() - lesson.updatedAt.getTime() > STALE_AFTER_MS) {
    const error = { code: "interrupted", message: "Building the breakdown was interrupted. Please try again." };
    await Lesson.updateOne({ _id: lesson._id, status: lesson.status }, { $set: { status: "error", error } });
    return { ...lesson, status: "error", error };
  }
  return lesson;
}

/** Like specs, a lesson goes to file storage and stays inline only when storage isn't configured or the upload fails. */
export async function storeLessonSpec(
  userId: string,
  problemId: string,
  lessonId: string,
  spec: LessonSpec,
): Promise<{ spec: LessonSpec; specKey?: undefined } | { spec?: undefined; specKey: string }> {
  if (!storageEnabled) return { spec };
  const key = `users/${userId}/problems/${problemId}/lessons/${lessonId}.json`;
  try {
    await putJson(key, spec);
    return { specKey: key };
  } catch (err) {
    console.error("[lessons] upload failed, keeping the lesson in the database:", err instanceof Error ? err.message : err);
    return { spec };
  }
}

export async function loadLessonSpec(stored: { spec?: unknown; specKey?: string | null }): Promise<LessonSpec | null> {
  if (stored.specKey) return getJson<LessonSpec>(stored.specKey);
  if (!stored.spec) return null;
  // Mongoose drops empty objects from Mixed fields; the renderers need them back.
  const spec = stored.spec as LessonSpec;
  for (const step of spec.cases.flatMap((c) => c.steps)) {
    step.states ??= {};
    for (const state of Object.values(step.states)) if (state.kind === "variables") state.vars ??= {};
  }
  return spec;
}

/** Deletes a lesson and its stored file. */
export async function deleteLesson(userId: string, lesson: { _id: Types.ObjectId; specKey?: string | null }) {
  const { deletedCount } = await Lesson.deleteOne({ _id: lesson._id, userId });
  if (deletedCount && lesson.specKey) {
    await deleteKeys([lesson.specKey]).catch((err) =>
      console.error("[lessons] file cleanup failed:", err instanceof Error ? err.message : err),
    );
  }
}

export async function serializeLesson(l: LessonDoc) {
  return {
    id: String(l._id),
    status: l.status,
    basedOnSolution: Boolean(l.basedOnSolutionId),
    spec: l.status === "done" ? await loadLessonSpec(l) : null,
    model: l.model ? { provider: l.model.provider, model: l.model.model } : null,
    progress: LESSON_IN_PROGRESS.has(l.status) ? ((l.progress as RunProgress | undefined) ?? null) : null,
    error: l.status === "error" && l.error?.message ? { code: l.error.code ?? "error", message: l.error.message } : null,
    createdAt: l.createdAt.toISOString(),
  };
}
export type LessonDetail = Awaited<ReturnType<typeof serializeLesson>>;
