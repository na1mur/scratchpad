import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const messageSchema = new Schema(
  {
    // A message belongs to exactly one of an attempt's chat or a solution's chat.
    attemptId: { type: Schema.Types.ObjectId, ref: "Attempt", required: false },
    solutionId: { type: Schema.Types.ObjectId, ref: "Solution", required: false },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, maxlength: 20_000 },
    focusStepIds: { type: [String], default: undefined },
    // 1-based index into the attempt's specVersions this answer created.
    producedSpecVersion: { type: Number, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

messageSchema.index({ attemptId: 1, createdAt: 1 });
messageSchema.index({ solutionId: 1, createdAt: 1 }, { sparse: true });

export type MessageDoc = InferSchemaType<typeof messageSchema> & { _id: mongoose.Types.ObjectId };

export const Message: Model<MessageDoc> =
  (mongoose.models.Message as Model<MessageDoc>) ?? mongoose.model<MessageDoc>("Message", messageSchema);
