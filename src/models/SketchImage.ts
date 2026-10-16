import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

/**
 * A picture in a learner's personal sketch image library (src/lib/sketch/images.ts). The file lives in R2 under
 * `r2Key`; sketches refer to it by this document's id, so a picture is stored once however often it's placed.
 */
const sketchImageSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    r2Key: { type: String, required: true },
    mimeType: { type: String, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    size: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

sketchImageSchema.index({ userId: 1, createdAt: -1 });

export type SketchImageDoc = InferSchemaType<typeof sketchImageSchema> & { _id: mongoose.Types.ObjectId };

export const SketchImage: Model<SketchImageDoc> =
  (mongoose.models.SketchImage as Model<SketchImageDoc>) ?? mongoose.model<SketchImageDoc>("SketchImage", sketchImageSchema);
