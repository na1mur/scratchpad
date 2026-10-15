import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A learner's sketch of one problem (docs/sketch-plan.md): the canvas elements, validated and repaired by
 * src/lib/sketch/restore.ts on every save. `rev` goes up on each save, so two saves at once can't overwrite each
 * other: the second retries on top of the first (src/lib/sketches.ts).
 */
const sketchSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true },
    schemaVersion: { type: Number, required: true },
    elements: { type: [Schema.Types.Mixed], default: [] },
    rev: { type: Number, default: 0 },
  },
  { timestamps: true, minimize: false },
);

sketchSchema.index({ userId: 1, problemId: 1 }, { unique: true });

export type SketchDoc = InferSchemaType<typeof sketchSchema> & { _id: mongoose.Types.ObjectId };

export const Sketch: Model<SketchDoc> =
  (mongoose.models.Sketch as Model<SketchDoc>) ?? mongoose.model<SketchDoc>("Sketch", sketchSchema);
