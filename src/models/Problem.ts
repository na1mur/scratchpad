import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TAGS } from "@/lib/tags";
import { VERDICTS } from "@/lib/verdicts";

const problemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    statement: { type: String, required: true, maxlength: 10_000 },
    tags: { type: [{ type: String, enum: TAGS }], default: [] },
    tagsSource: { type: String, enum: ["user", "auto", "none"], default: "none", required: true },
    // Snapshot of the user's preferred language when the problem was created.
    language: { type: String, required: true },
    latestAttemptId: { type: Schema.Types.ObjectId, ref: "Attempt", required: false },
    attemptCount: { type: Number, default: 0, required: true },
    lastVerdict: { type: String, enum: VERDICTS, required: false },
  },
  { timestamps: true },
);

problemSchema.index(
  { title: "text", statement: "text" },
  {
    weights: { title: 5, statement: 1 },
    // Mongo would otherwise read our `language` field ("python", …) as the
    // text-search language and refuse to index the document.
    language_override: "textSearchLanguage",
  },
);
problemSchema.index({ userId: 1, tags: 1, updatedAt: -1 });

export type ProblemDoc = InferSchemaType<typeof problemSchema> & { _id: mongoose.Types.ObjectId };

export const Problem: Model<ProblemDoc> =
  (mongoose.models.Problem as Model<ProblemDoc>) ?? mongoose.model<ProblemDoc>("Problem", problemSchema);
