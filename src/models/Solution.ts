import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { SOLUTION_REQUEST_KINDS } from "@/lib/ai/schemas/solution";
import { PROVIDERS } from "@/lib/providers";

export const SOLUTION_STATUSES = ["queued", "solving", "tracing", "narrating", "done", "error"] as const;
export type SolutionStatus = (typeof SOLUTION_STATUSES)[number];

/**
 * A worked solution for a problem, versioned per problem like attempts. The
 * first is built from the learner's attempt; later ones answer a request
 * (another approach, a better Big-O). Solutions are generated once and kept.
 */
const solutionSchema = new Schema(
  {
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    version: { type: Number, required: true },
    request: {
      kind: { type: String, enum: SOLUTION_REQUEST_KINDS, required: true },
      note: { type: String, default: "", maxlength: 1_000 },
    },
    basedOnAttemptId: { type: Schema.Types.ObjectId, ref: "Attempt", required: false },
    basedOnAttemptVersion: { type: Number, required: false },
    language: { type: String, required: true },
    status: { type: String, enum: SOLUTION_STATUSES, default: "queued", required: true },
    // Validated against solutionContentSchema before it is stored.
    content: { type: Schema.Types.Mixed, required: false },
    // The walkthrough, as a VizSpec: inline, or `specR2Key` when it was too large and lives in R2.
    vizSpec: { type: Schema.Types.Mixed, required: false },
    specR2Key: { type: String, required: false },
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
    error: {
      code: { type: String, required: false },
      message: { type: String, required: false },
    },
  },
  { timestamps: true },
);

solutionSchema.index({ problemId: 1, version: 1 }, { unique: true });

export type SolutionDoc = InferSchemaType<typeof solutionSchema> & { _id: mongoose.Types.ObjectId };

export const Solution: Model<SolutionDoc> =
  (mongoose.models.Solution as Model<SolutionDoc>) ?? mongoose.model<SolutionDoc>("Solution", solutionSchema);
