import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { LANGUAGES } from "@/lib/languages";
import { PROVIDERS } from "@/lib/providers";

export const ONBOARDING_STEPS = ["language", "provider", "done"] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

const encryptedFieldSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true },
  },
  { _id: false },
);

const visionSchema = new Schema(
  {
    provider: { type: String, enum: PROVIDERS, required: true },
    model: { type: String, required: true },
    // Absent when the vision model reuses the main provider's key.
    apiKey: { type: encryptedFieldSchema, required: false },
    keyLast4: { type: String, required: false },
  },
  { _id: false },
);

const aiSchema = new Schema(
  {
    provider: { type: String, enum: PROVIDERS, required: true },
    model: { type: String, required: true },
    apiKey: { type: encryptedFieldSchema, required: true },
    keyLast4: { type: String, required: true },
    vision: { type: visionSchema, required: false },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    preferredLanguage: { type: String, enum: LANGUAGES.map((l) => l.id), required: false },
    onboardingStep: { type: String, enum: ONBOARDING_STEPS, default: "language", required: true },
    ai: { type: aiSchema, required: false },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export type EncryptedField = InferSchemaType<typeof encryptedFieldSchema>;

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
