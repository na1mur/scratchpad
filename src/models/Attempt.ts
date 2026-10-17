import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { PROVIDERS } from "@/lib/providers";
import { VERDICTS } from "@/lib/verdicts";

export const ATTEMPT_STATUSES = [
  "queued",
  "extracting",
  "understanding",
  "tracing",
  "diagnosing",
  "done",
  "error",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

const imageSchema = new Schema(
  {
    storageKey: { type: String, required: true },
    mimeType: { type: String, required: true },
    extractedText: { type: String, required: false },
  },
  { _id: false },
);

const specVersionSchema = new Schema(
  {
    createdAt: { type: Date, default: Date.now, required: true },
    reason: { type: String, required: true },
    // Validated against vizSpecSchema before it is stored. Holds the spec
    // inline (only when file storage isn't configured or an upload failed), else `specKey`.
    vizSpec: { type: Schema.Types.Mixed, required: false },
    specKey: { type: String, required: false },
  },
  // Keep empty objects such as `vars: {}` on a step with no variables yet, which the spec requires.
  // Subdocuments drop them by default, even in an update's `$set`.
  { _id: false, minimize: false },
);

const attemptSchema = new Schema(
  {
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, required: true },
    pseudoCode: { type: String, required: true, maxlength: 10_000 },
    idea: { type: String, default: "", maxlength: 10_000 },
    images: { type: [imageSchema], default: [] },
    status: { type: String, enum: ATTEMPT_STATUSES, default: "queued", required: true },
    understanding: { type: Schema.Types.Mixed, required: false },
    // A RunProgress snapshot while the run is in progress (src/lib/runProgress.ts); removed when it's done.
    progress: { type: Schema.Types.Mixed, required: false },
    // The first spec's verdict, kept here so listings don't have to load the spec from file storage.
    verdict: { type: String, enum: VERDICTS, required: false },
    vizSpec: { type: Schema.Types.Mixed, required: false },
    specKey: { type: String, required: false },
    specVersions: { type: [specVersionSchema], default: [] },
    traceMode: { type: String, enum: ["execution", "simulation"], required: false },
    model: {
      provider: { type: String, enum: PROVIDERS, required: true },
      model: { type: String, required: true },
    },
    tokenUsage: {
      inputTokens: { type: Number, default: 0 },
      outputTokens: { type: Number, default: 0 },
      totalTokens: { type: Number, default: 0 },
    },
    // Where the first run's time went (RunStats in src/lib/ai/pipeline/llm.ts), for tuning the pipeline.
    runStats: { type: Schema.Types.Mixed, required: false },
    error: {
      code: { type: String, required: false },
      message: { type: String, required: false },
    },
  },
  { timestamps: true },
);

attemptSchema.index({ userId: 1, createdAt: -1 });
attemptSchema.index({ problemId: 1, version: 1 }, { unique: true });

export type AttemptDoc = InferSchemaType<typeof attemptSchema> & { _id: mongoose.Types.ObjectId };

export const Attempt: Model<AttemptDoc> =
  (mongoose.models.Attempt as Model<AttemptDoc>) ?? mongoose.model<AttemptDoc>("Attempt", attemptSchema);
