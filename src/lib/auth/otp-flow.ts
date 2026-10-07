import "server-only";
import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api";
import { setAuthCookies } from "@/lib/auth/cookies";
import { checkOtp, createOtp, type OtpCheck } from "@/lib/auth/otp";
import { homeFor } from "@/lib/auth/routes";
import { issueTokenPair } from "@/lib/auth/tokens";
import { sendMail } from "@/lib/email/mailer";
import { otpEmail } from "@/lib/email/templates";
import { rateLimits } from "@/lib/rateLimit";
import { publicUser } from "@/lib/serializers";
import type { OtpPurpose } from "@/models/OtpCode";
import type { UserDoc } from "@/models/User";

/**
 * Throttles emails per address, whether or not the address has an account, so
 * the response can't be used to find out who has one.
 */
export async function enforceSendLimits(email: string, purpose: OtpPurpose) {
  const key = `${purpose}:${email}`;
  const cooldown = await rateLimits.otpCooldown().consume(key);
  if (!cooldown.ok) {
    throw new ApiError(429, "otp_cooldown", `Please wait ${cooldown.retryAfterSeconds}s before asking for another code.`);
  }
  const hourly = await rateLimits.otpHourly().consume(key);
  if (!hourly.ok) {
    throw new ApiError(429, "rate_limited", "Too many codes requested. Try again later.");
  }
}

export async function sendOtp(user: Pick<UserDoc, "_id" | "email" | "name">, purpose: OtpPurpose) {
  const code = await createOtp(String(user._id), purpose);
  await sendMail(otpEmail({ to: user.email, name: user.name, code, purpose }));
}

const OTP_ERRORS: Record<Exclude<OtpCheck, "ok">, ApiError> = {
  invalid: new ApiError(400, "otp_invalid", "That code isn't right. Check it and try again."),
  expired: new ApiError(400, "otp_expired", "That code has expired. Request a new one."),
  locked: new ApiError(429, "otp_locked", "Too many wrong attempts. Request a new code."),
};

/** Checks a submitted code and throws the matching API error unless it is valid. */
export async function requireValidOtp(userId: string, purpose: OtpPurpose, code: string) {
  const result = await checkOtp(userId, purpose, code);
  if (result !== "ok") {
    const { status, code: errCode, message } = OTP_ERRORS[result];
    throw new ApiError(status, errCode, message);
  }
}

/** Starts a session for the user and answers with the usual `{ user, redirectTo }` body. */
export async function sessionResponse(user: UserDoc, status = 200) {
  const tokens = await issueTokenPair(String(user._id), user.onboardingStep);
  const res = NextResponse.json({ user: publicUser(user), redirectTo: homeFor(user.onboardingStep) }, { status });
  setAuthCookies(res, tokens);
  return res;
}
