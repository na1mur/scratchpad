import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { TAGS } from "@/lib/tags";
import { VERDICTS } from "@/lib/verdicts";

const problemSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    statement: { type: String, required: true, maxlength: 10_000 },
    // Where the problem came from (LeetCode etc.), if the learner gave a link.
    sourceUrl: { type: String, required: false, trim: true, maxlength: 2000 },
    // Text of the linked page, fetched on the server (src/lib/problemSource.ts) and given to the model.
    sourceText: { type: String, required: false, maxlength: 10_000 },
    // When the link was last tried; set even if the fetch failed, so it isn't retried on every run.
    sourceFetchedAt: { type: Date, required: false },
    // Known solutions found on the web (src/lib/problemReference.ts), one entry per language. Never shown to the
    // learner as-is; an entry with empty text records a lookup that found nothing.
    references: {
      type: [
        {
          _id: false,
          language: { type: String, required: true },
          text: { type: String, default: "", maxlength: 12_000 },
          sources: {
            type: [{ _id: false, title: { type: String, required: true }, url: { type: String, required: true }, license: String }],
            default: [],
          },
          fetchedAt: { type: Date, required: true },
        },
      ],
      default: [],
    },
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
