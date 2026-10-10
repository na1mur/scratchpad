import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { KEY_PROVIDERS } from "@/lib/providers";
import { encryptedFieldSchema } from "@/models/encryptedField";

// A user's saved API keys, one per distinct key and provider. The settings on User point at the one in
// use through `keyId` and keep their own encrypted copy, so runs never need a second lookup.
const providerKeySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    provider: { type: String, enum: KEY_PROVIDERS, required: true },
    apiKey: { type: encryptedFieldSchema, required: true },
    keyLast4: { type: String, required: true },
    // HMAC of the key, so saving the same key again finds the existing entry.
    fingerprint: { type: String, required: true },
    label: { type: String, required: false, trim: true, maxlength: 40 },
    // The learner's own note: what the key is for, its credit balance, anything.
    note: { type: String, required: false, trim: true, maxlength: 500 },
    // When it was last activated; orders a provider's keys, but isn't shown.
    lastUsedAt: { type: Date, required: true },
    // The provider refused the key last time it was tried; cleared when it next works.
    rejected: { type: Boolean, required: true, default: false },
  },
  { timestamps: true },
);

providerKeySchema.index({ userId: 1, fingerprint: 1 }, { unique: true });

export type ProviderKeyDoc = InferSchemaType<typeof providerKeySchema> & { _id: mongoose.Types.ObjectId };

if (process.env.NODE_ENV !== "production" && mongoose.models.ProviderKey) mongoose.deleteModel("ProviderKey");

export const ProviderKey: Model<ProviderKeyDoc> =
  (mongoose.models.ProviderKey as Model<ProviderKeyDoc>) ??
  mongoose.model<ProviderKeyDoc>("ProviderKey", providerKeySchema);
