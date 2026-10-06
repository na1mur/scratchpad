import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "@/lib/env";

export type EncryptedValue = {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyVersion: number;
};

const ALGORITHM = "aes-256-gcm";

// To rotate: add the new key under a new version, keep the old one here until
// every stored value has been re-encrypted, then drop it.
const keyring = new Map<number, Buffer>([
  [env.ENCRYPTION_KEY_VERSION, Buffer.from(env.ENCRYPTION_KEY, "base64")],
]);

export function encrypt(plaintext: string): EncryptedValue {
  const key = keyring.get(env.ENCRYPTION_KEY_VERSION)!;
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyVersion: env.ENCRYPTION_KEY_VERSION,
  };
}

export function decrypt(value: EncryptedValue): string {
  const key = keyring.get(value.keyVersion);
  if (!key) throw new Error(`No encryption key for version ${value.keyVersion}`);
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(value.iv, "base64"));
  decipher.setAuthTag(Buffer.from(value.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(value.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function last4(secret: string): string {
  return secret.slice(-4);
}
