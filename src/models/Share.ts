import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const SHARE_KINDS = ["attempt", "solution"] as const;
export type ShareKind = (typeof SHARE_KINDS)[number];

/**
 * A public, read-only link to one attempt or one solution version. Unsharing deletes it, so the old link
 * stops working for good; sharing again makes a new token.
 */
const shareSchema = new Schema(
  {
    token: { type: String, required: true, unique: true },
    kind: { type: String, enum: SHARE_KINDS, required: true },
    // The attempt or solution being shared.
    targetId: { type: Schema.Types.ObjectId, required: true },
    problemId: { type: Schema.Types.ObjectId, ref: "Problem", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

shareSchema.index({ kind: 1, targetId: 1 }, { unique: true });
shareSchema.index({ problemId: 1 });

export type ShareDoc = InferSchemaType<typeof shareSchema> & { _id: mongoose.Types.ObjectId };

export const Share: Model<ShareDoc> =
  (mongoose.models.Share as Model<ShareDoc>) ?? mongoose.model<ShareDoc>("Share", shareSchema);
