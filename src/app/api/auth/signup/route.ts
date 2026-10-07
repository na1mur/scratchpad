import { NextResponse, type NextRequest } from "next/server";
import { ApiError, clientIp, handle, parseJson } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { enforceSendLimits, sendOtp } from "@/lib/auth/otp-flow";
import { connectDB } from "@/lib/db";
import { rateLimits } from "@/lib/rateLimit";
import { signupSchema } from "@/lib/schemas/auth";
import { User, isUnverified } from "@/models/User";

const emailTaken = () => new ApiError(409, "email_taken", "An account with this email already exists.");

/**
 * Creates the account unverified and emails a code. No session is issued
 * until /api/auth/verify-email proves the address is the user's.
 */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { name, email, password } = await parseJson(req, signupSchema);
    const limit = await rateLimits.signup().consume(clientIp(req));
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `Too many sign-ups. Try again in ${limit.retryAfterSeconds}s.`);
    }

    await connectDB();
    const existing = await User.findOne({ email });
    // A verified account is taken. An unverified one is just somebody's
    // abandoned (or squatted) attempt, so the new signup replaces it.
    if (existing && !isUnverified(existing)) throw emailTaken();

    await enforceSendLimits(email, "verify_email");
    const passwordHash = await hashPassword(password);
    let user = existing;
    if (user) {
      user.name = name;
      user.passwordHash = passwordHash;
      await user.save();
    } else {
      try {
        user = await User.create({ name, email, passwordHash, emailVerified: false });
      } catch (err) {
        // Lost a race with a concurrent signup for the same email.
        if ((err as { code?: number }).code === 11000) throw emailTaken();
        throw err;
      }
    }

    await sendOtp(user, "verify_email");
    return NextResponse.json({ verificationRequired: true, email }, { status: 201 });
  });
}
