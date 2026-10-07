import type { NextRequest } from "next/server";
import { ApiError, clientIp, handle, parseJson } from "@/lib/api";
import { requireValidOtp, sessionResponse } from "@/lib/auth/otp-flow";
import { connectDB } from "@/lib/db";
import { rateLimits } from "@/lib/rateLimit";
import { verifyEmailSchema } from "@/lib/schemas/auth";
import { User } from "@/models/User";

/** Confirms the emailed code, marks the address verified and logs the user in. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email, code } = await parseJson(req, verifyEmailSchema);
    const limit = await rateLimits.otpVerify().consume(`${clientIp(req)}:${email}`);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`);
    }

    await connectDB();
    const user = await User.findOne({ email }).lean();
    // Same answer as a stale code, so this can't be used to probe for accounts.
    if (!user) throw new ApiError(400, "otp_expired", "That code has expired. Request a new one.");

    await requireValidOtp(String(user._id), "verify_email", code);
    await User.updateOne({ _id: user._id }, { $set: { emailVerified: true } });
    return sessionResponse({ ...user, emailVerified: true });
  });
}
