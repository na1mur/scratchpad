import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const OTP_PURPOSES = ["verify_email", "reset_password"] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

const otpCodeSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    purpose: { type: String, enum: OTP_PURPOSES, required: true },
    // HMAC of the code; the 6 digits themselves are never stored.
    codeHash: { type: String, required: true },
    attempts: { type: Number, required: true, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One live code per user and purpose; issuing a new one replaces the old.
otpCodeSchema.index({ userId: 1, purpose: 1 }, { unique: true });
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type OtpCodeDoc = InferSchemaType<typeof otpCodeSchema> & { _id: mongoose.Types.ObjectId };

export const OtpCode: Model<OtpCodeDoc> =
  (mongoose.models.OtpCode as Model<OtpCodeDoc>) ?? mongoose.model<OtpCodeDoc>("OtpCode", otpCodeSchema);
