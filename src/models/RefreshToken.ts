import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    jti: { type: String, required: true, unique: true },
    // SHA-256 of the raw token; the token itself is never stored.
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, required: false },
    replacedBy: { type: String, required: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = InferSchemaType<typeof refreshTokenSchema> & {
  _id: mongoose.Types.ObjectId;
};

export const RefreshToken: Model<RefreshTokenDoc> =
  (mongoose.models.RefreshToken as Model<RefreshTokenDoc>) ??
  mongoose.model<RefreshTokenDoc>("RefreshToken", refreshTokenSchema);
