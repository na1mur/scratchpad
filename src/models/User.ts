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
    // Optional only because accounts created before names were collected lack one.
    name: { type: String, required: false, trim: true, maxlength: 60 },
    // Absent for accounts that only ever signed in with Google.
    passwordHash: { type: String, required: false },
    // Set to false at signup and flipped by the emailed code or a verified Google
    // email. Accounts from before verification existed have no value and count as verified.
    emailVerified: { type: Boolean, required: false },
    // Google's stable account id (the `sub` claim).
    googleId: { type: String, required: false, unique: true, sparse: true },
    // Google's profile picture URL, refreshed on every Google login.
    googlePicture: { type: String, required: false },
    // R2 key of a photo the user uploaded themselves; wins over `googlePicture`.
    avatarKey: { type: String, required: false },
    preferredLanguage: { type: String, enum: LANGUAGES.map((l) => l.id), required: false },
    onboardingStep: { type: String, enum: ONBOARDING_STEPS, default: "language", required: true },
    ai: { type: aiSchema, required: false },
  },
  { timestamps: true },
);

/** Only an explicit `false` blocks login; see `emailVerified` above. */
export const isUnverified = (user: Pick<UserDoc, "emailVerified">) => user.emailVerified === false;

export type UserDoc = InferSchemaType<typeof userSchema> & { _id: mongoose.Types.ObjectId };
export type EncryptedField = InferSchemaType<typeof encryptedFieldSchema>;

// In dev, hot reloads keep the old registered model, whose stale schema silently
// strips any field added since (strict mode). Re-register so schema edits apply.
if (process.env.NODE_ENV !== "production" && mongoose.models.User) mongoose.deleteModel("User");

export const User: Model<UserDoc> =
  (mongoose.models.User as Model<UserDoc>) ?? mongoose.model<UserDoc>("User", userSchema);
