import { NextResponse, type NextRequest } from "next/server";
import { ApiError, clientIp, handle, parseJson } from "@/lib/api";
import { deleteOtps } from "@/lib/auth/otp";
import { requireValidOtp } from "@/lib/auth/otp-flow";
import { hashPassword } from "@/lib/auth/password";
import { connectDB } from "@/lib/db";
import { rateLimits } from "@/lib/rateLimit";
import { resetPasswordSchema } from "@/lib/schemas/auth";
import { RefreshToken } from "@/models/RefreshToken";
import { User } from "@/models/User";

/** Sets a new password from the emailed code. Works for Google-only accounts too, which adds a password. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email, code, password } = await parseJson(req, resetPasswordSchema);
    const limit = await rateLimits.otpVerify().consume(`${clientIp(req)}:${email}`);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`);
    }

    await connectDB();
    const user = await User.findOne({ email }, { _id: 1 }).lean();
    if (!user) throw new ApiError(400, "otp_expired", "That code has expired. Request a new one.");

    const userId = String(user._id);
    await requireValidOtp(userId, "reset_password", code);
    // Receiving the code also proves the address, so this verifies it too.
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash: await hashPassword(password), emailVerified: true } },
    );
    // Sign out everywhere: whoever held the old password or a stolen session is out.
    await RefreshToken.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await deleteOtps(userId);
    return NextResponse.json({ ok: true });
  });
}
