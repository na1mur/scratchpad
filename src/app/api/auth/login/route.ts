import type { NextRequest } from "next/server";
import { ApiError, clientIp, handle, parseJson } from "@/lib/api";
import { verifyPassword } from "@/lib/auth/password";
import { enforceSendLimits, sendOtp, sessionResponse } from "@/lib/auth/otp-flow";
import { connectDB } from "@/lib/db";
import { rateLimits } from "@/lib/rateLimit";
import { loginSchema } from "@/lib/schemas/auth";
import { User, isUnverified } from "@/models/User";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email, password } = await parseJson(req, loginSchema);
    const limit = await rateLimits.login().consume(`${clientIp(req)}:${email}`);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`);
    }

    await connectDB();
    const user = await User.findOne({ email }).lean();
    // Always runs a bcrypt compare, also when there is no user or no password.
    const passwordOk = await verifyPassword(password, user?.passwordHash);
    if (!user || !passwordOk) {
      if (user && !user.passwordHash) {
        throw new ApiError(
          401,
          "use_google",
          "This account signs in with Google. Use the Google button, or reset your password to add one.",
        );
      }
      throw new ApiError(401, "invalid_credentials", "Invalid email or password.");
    }

    if (isUnverified(user)) {
      // Best effort: the verify page also has a resend button.
      try {
        await enforceSendLimits(email, "verify_email");
        await sendOtp(user, "verify_email");
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
      }
      throw new ApiError(403, "email_not_verified", "Verify your email to continue. We've sent you a code.");
    }

    return sessionResponse(user);
  });
}
