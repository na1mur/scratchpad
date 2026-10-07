import { NextResponse, type NextRequest } from "next/server";
import { decodeIdToken } from "arctic";
import { setAuthCookies } from "@/lib/auth/cookies";
import {
  GOOGLE_COOKIE_PATH,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleClient,
} from "@/lib/auth/google";
import type { GoogleErrorCode } from "@/lib/auth/google-errors";
import { homeFor } from "@/lib/auth/routes";
import { issueTokenPair } from "@/lib/auth/tokens";
import { connectDB } from "@/lib/db";
import { safeNextPath } from "@/lib/schemas/auth";
import { User, isUnverified, type UserDoc } from "@/models/User";

type GoogleClaims = { sub?: string; email?: string; email_verified?: boolean; name?: string };

class GoogleLoginError extends Error {
  constructor(public code: GoogleErrorCode) {
    super(code);
  }
}

/**
 * Finds the account for a Google identity, linking it to an existing
 * email-and-password account with the same address, or creating a new one.
 * Callers have already checked that Google says the email is verified.
 */
async function resolveUser(sub: string, email: string, name: string | undefined): Promise<UserDoc> {
  const byGoogleId = await User.findOne({ googleId: sub }).lean();
  if (byGoogleId) return byGoogleId;

  const byEmail = await User.findOne({ email });
  if (byEmail) {
    if (byEmail.googleId && byEmail.googleId !== sub) throw new GoogleLoginError("google_conflict");
    byEmail.googleId = sub;
    // Google vouches for this address, so it counts as verified now.
    if (isUnverified(byEmail)) {
      // Whoever registered it first never proved they own it. Drop their
      // password so they can't keep a way into the real owner's account.
      byEmail.passwordHash = undefined;
    }
    byEmail.emailVerified = true;
    byEmail.name ||= name;
    await byEmail.save();
    return byEmail.toObject();
  }

  try {
    const created = await User.create({
      email,
      googleId: sub,
      emailVerified: true,
      name: (name || email.split("@")[0]).slice(0, 60),
    });
    return created.toObject();
  } catch (err) {
    // A concurrent callback created it first.
    if ((err as { code?: number }).code === 11000) {
      const existing = await User.findOne({ googleId: sub }).lean();
      if (existing) return existing;
    }
    throw err;
  }
}

export async function GET(req: NextRequest) {
  const fail = (code: GoogleErrorCode) => {
    const res = NextResponse.redirect(new URL(`/login?error=${code}`, req.url));
    clearOauthCookies(res);
    return res;
  };

  const google = googleClient();
  if (!google) return fail("google_unavailable");

  const params = req.nextUrl.searchParams;
  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "google_cancelled" : "google_failed");

  const code = params.get("code");
  const state = params.get("state");
  const savedState = req.cookies.get(GOOGLE_STATE_COOKIE)?.value;
  const verifier = req.cookies.get(GOOGLE_VERIFIER_COOKIE)?.value;
  if (!code || !state || !savedState || !verifier || state !== savedState) return fail("google_failed");

  try {
    const tokens = await google.validateAuthorizationCode(code, verifier);
    // The token came straight from Google's token endpoint over TLS, so decoding without
    // re-verifying its signature is what the OpenID Connect spec allows here.
    const claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
    if (!claims.sub || !claims.email) return fail("google_failed");
    if (claims.email_verified !== true) return fail("google_unverified");

    await connectDB();
    const user = await resolveUser(claims.sub, claims.email.trim().toLowerCase(), claims.name?.trim());

    const issued = await issueTokenPair(String(user._id), user.onboardingStep);
    // `next` only matters once onboarding is done; otherwise onboarding wins.
    const home = homeFor(user.onboardingStep);
    const next = safeNextPath(req.cookies.get(GOOGLE_NEXT_COOKIE)?.value);
    const res = NextResponse.redirect(new URL(home === "/problems" ? next : home, req.url));
    setAuthCookies(res, issued);
    clearOauthCookies(res);
    return res;
  } catch (err) {
    if (err instanceof GoogleLoginError) return fail(err.code);
    console.error("[auth] google callback failed:", err instanceof Error ? err.message : err);
    return fail("google_failed");
  }
}

function clearOauthCookies(res: NextResponse) {
  for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE, GOOGLE_NEXT_COOKIE]) {
    res.cookies.set(name, "", { httpOnly: true, path: GOOGLE_COOKIE_PATH, maxAge: 0 });
  }
}
