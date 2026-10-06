import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson } from "@/lib/api";
import { setAuthCookies } from "@/lib/auth/cookies";
import { hashPassword } from "@/lib/auth/password";
import { homeFor } from "@/lib/auth/routes";
import { issueTokenPair } from "@/lib/auth/tokens";
import { connectDB } from "@/lib/db";
import { credentialsSchema } from "@/lib/schemas/auth";
import { publicUser } from "@/lib/serializers";
import { User } from "@/models/User";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const { email, password } = await parseJson(req, credentialsSchema);
    await connectDB();
    if (await User.exists({ email })) {
      throw new ApiError(409, "email_taken", "An account with this email already exists.");
    }
    let user;
    try {
      user = await User.create({ email, passwordHash: await hashPassword(password) });
    } catch (err) {
      // Lost a race with a concurrent signup for the same email.
      if ((err as { code?: number }).code === 11000) {
        throw new ApiError(409, "email_taken", "An account with this email already exists.");
      }
      throw err;
    }
    const tokens = await issueTokenPair(String(user._id), user.onboardingStep);
    const res = NextResponse.json(
      { user: publicUser(user.toObject()), redirectTo: homeFor(user.onboardingStep) },
      { status: 201 },
    );
    setAuthCookies(res, tokens);
    return res;
  });
}
