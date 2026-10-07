import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { connectDB } from "@/lib/db";
import { OtpCode, type OtpPurpose } from "@/models/OtpCode";

export const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export type OtpCheck = "ok" | "invalid" | "expired" | "locked";

// A 6-digit code is trivially brute-forced from a plain hash, so it's keyed.
function hashCode(userId: string, purpose: OtpPurpose, code: string) {
  return createHmac("sha256", env.ENCRYPTION_KEY).update(`otp:${purpose}:${userId}:${code}`).digest("hex");
}

/** Replaces any live code for this user and purpose and returns the new one. */
export async function createOtp(userId: string, purpose: OtpPurpose): Promise<string> {
  await connectDB();
  const code = String(randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, "0");
  await OtpCode.findOneAndUpdate(
    { userId, purpose },
    {
      $set: {
        codeHash: hashCode(userId, purpose, code),
        attempts: 0,
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
  return code;
}

/** Wrong guesses are counted; after MAX_ATTEMPTS the code is destroyed. A correct code is single-use. */
export async function checkOtp(userId: string, purpose: OtpPurpose, code: string): Promise<OtpCheck> {
  await connectDB();
  // Count the attempt first so parallel guesses can't skip the limit.
  const doc = await OtpCode.findOneAndUpdate(
    { userId, purpose },
    { $inc: { attempts: 1 } },
    { returnDocument: "after" },
  );
  if (!doc || doc.expiresAt.getTime() <= Date.now()) return "expired";
  if (doc.attempts > MAX_ATTEMPTS) {
    await OtpCode.deleteOne({ _id: doc._id });
    return "locked";
  }

  const expected = Buffer.from(doc.codeHash, "hex");
  const given = Buffer.from(hashCode(userId, purpose, code), "hex");
  if (!timingSafeEqual(expected, given)) {
    if (doc.attempts >= MAX_ATTEMPTS) {
      await OtpCode.deleteOne({ _id: doc._id });
      return "locked";
    }
    return "invalid";
  }
  // Atomic consume: of two concurrent correct submissions, only one wins.
  const consumed = await OtpCode.findOneAndDelete({ _id: doc._id });
  return consumed ? "ok" : "expired";
}

export async function deleteOtps(userId: string) {
  await connectDB();
  await OtpCode.deleteMany({ userId });
}
