import { NextResponse, type NextRequest } from "next/server";
import { errorResponse, handle } from "@/lib/api";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "@/lib/auth/cookies";
import { rotateRefreshToken } from "@/lib/auth/tokens";
import { safeNextPath } from "@/lib/schemas/auth";

/**
 * Page flow: the proxy redirects here when the access token is missing or
 * expired. Rotate and bounce back to `next`, or send the user to /login.
 */
export function GET(req: NextRequest) {
  return handle(req, async () => {
    const next = safeNextPath(req.nextUrl.searchParams.get("next"));
    const result = await rotateRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);

    if (result.ok || result.reason === "concurrent") {
      // On "concurrent" the racing request already set fresh cookies.
      const res = NextResponse.redirect(new URL(next, req.url));
      if (result.ok) setAuthCookies(res, result.tokens);
      return res;
    }

    const login = new URL("/login", req.url);
    if (next !== "/problems") login.searchParams.set("next", next);
    const res = NextResponse.redirect(login);
    clearAuthCookies(res);
    return res;
  });
}

/** API flow: the client fetch wrapper calls this after a 401, then retries. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const result = await rotateRefreshToken(req.cookies.get(REFRESH_COOKIE)?.value);
    if (result.ok) {
      const res = NextResponse.json({ ok: true, onboardingStep: result.onboardingStep });
      setAuthCookies(res, result.tokens);
      return res;
    }
    if (result.reason === "concurrent") {
      return errorResponse(409, "concurrent_refresh", "Session was refreshed by another request.");
    }
    const res = errorResponse(401, "session_expired", "Your session has expired. Please log in again.");
    clearAuthCookies(res);
    return res;
  });
}
