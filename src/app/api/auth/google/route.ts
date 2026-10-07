import { NextResponse, type NextRequest } from "next/server";
import { generateCodeVerifier, generateState } from "arctic";
import {
  GOOGLE_COOKIE_MAX_AGE,
  GOOGLE_COOKIE_PATH,
  GOOGLE_NEXT_COOKIE,
  GOOGLE_SCOPES,
  GOOGLE_STATE_COOKIE,
  GOOGLE_VERIFIER_COOKIE,
  googleClient,
} from "@/lib/auth/google";
import { safeNextPath } from "@/lib/schemas/auth";

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: GOOGLE_COOKIE_PATH,
  maxAge: GOOGLE_COOKIE_MAX_AGE,
};

/** Starts "Continue with Google": remembers state + PKCE verifier, then sends the browser to Google. */
export function GET(req: NextRequest) {
  const google = googleClient();
  if (!google) return NextResponse.redirect(new URL("/login?error=google_unavailable", req.url));

  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const url = google.createAuthorizationURL(state, codeVerifier, GOOGLE_SCOPES);
  // Always show the account picker, so a user with several Google accounts chooses.
  url.searchParams.set("prompt", "select_account");

  const res = NextResponse.redirect(url);
  res.cookies.set(GOOGLE_STATE_COOKIE, state, cookieOptions);
  res.cookies.set(GOOGLE_VERIFIER_COOKIE, codeVerifier, cookieOptions);
  res.cookies.set(GOOGLE_NEXT_COOKIE, safeNextPath(req.nextUrl.searchParams.get("next")), cookieOptions);
  return res;
}
