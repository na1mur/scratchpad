import { Schema, type InferSchemaType } from "mongoose";

/** An AES-GCM encrypted secret, as produced by `encrypt()` in `src/lib/crypto.ts`. */
export const encryptedFieldSchema = new Schema(
  {
    ciphertext: { type: String, required: true },
    iv: { type: String, required: true },
    authTag: { type: String, required: true },
    keyVersion: { type: Number, required: true },
  },
  { _id: false },
);

export type EncryptedField = InferSchemaType<typeof encryptedFieldSchema>;
