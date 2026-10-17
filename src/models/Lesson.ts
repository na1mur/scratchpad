import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PROVIDERS } from "@/lib/providers";

export const LESSON_STATUSES = ["queued", "solving", "tracing", "writing", "done", "error"] as const;
export type LessonStatus = (typeof LESSON_STATUSES)[number];

/**
 * A problem's lesson: slides on how to think about it, with no code (src/lib/ai/schemas/lesson.ts). One per
 * problem; building it again replaces it. It builds on a finished solution when there is one, otherwise
 * it works one out without saving it as a solution.
 */
const lessonSchema = new Schema(
  {
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: LESSON_STATUSES, default: "queued", required: true },
    /** The solution whose approach and trace it teaches; absent when it worked one out itself. */
    basedOnSolutionId: { type: Schema.Types.ObjectId, ref: "Solution", required: false },
    // The LessonSpec: in file storage under `specKey`, or inline when storage isn't configured or an upload failed.
    spec: { type: Schema.Types.Mixed, required: false },
    specKey: { type: String, required: false },
    model: {
      provider: { type: String, enum: PROVIDERS, required: true },
      model: { type: String, required: true },
    },
    tokenUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    runStats: { type: Schema.Types.Mixed, required: false },
    // A RunProgress snapshot while the run is in progress (src/lib/runProgress.ts); removed when it settles.
    progress: { type: Schema.Types.Mixed, required: false },
    error: {
      code: { type: String, required: false },
      message: { type: String, required: false },
    },
  },
  { timestamps: true },
);

lessonSchema.index({ problemId: 1 }, { unique: true });
lessonSchema.index({ userId: 1 });

export type LessonDoc = InferSchemaType<typeof lessonSchema> & { _id: mongoose.Types.ObjectId };

export const Lesson: Model<LessonDoc> =
  (mongoose.models.Lesson as Model<LessonDoc>) ?? mongoose.model<LessonDoc>("Lesson", lessonSchema);
