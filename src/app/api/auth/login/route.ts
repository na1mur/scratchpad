import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson } from "@/lib/api";
import { setAuthCookies } from "@/lib/auth/cookies";
import { verifyPassword } from "@/lib/auth/password";
import { homeFor } from "@/lib/auth/routes";
import { issueTokenPair } from "@/lib/auth/tokens";
import { connectDB } from "@/lib/db";
import { rateLimits } from "@/lib/rateLimit";
import { credentialsSchema } from "@/lib/schemas/auth";
import { publicUser } from "@/lib/serializers";
import { User } from "@/models/User";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email, password } = await parseJson(req, credentialsSchema);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const limit = await rateLimits.login().consume(`${ip}:${email}`);
    if (!limit.ok) {
      throw new ApiError(429, "rate_limited", `Too many attempts. Try again in ${limit.retryAfterSeconds}s.`);
    }

    await connectDB();
    const user = await User.findOne({ email });
    if (!(await verifyPassword(password, user?.passwordHash)) || !user) {
      throw new ApiError(401, "invalid_credentials", "Invalid email or password.");
    }

    const tokens = await issueTokenPair(String(user._id), user.onboardingStep);
    const res = NextResponse.json({
      user: publicUser(user.toObject()),
      redirectTo: homeFor(user.onboardingStep),
    });
    setAuthCookies(res, tokens);
    return res;
  });
}
