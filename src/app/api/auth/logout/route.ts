import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { revokeByRawToken } from "@/lib/auth/tokens";

/**
 * Escape hatch for a session whose user no longer exists: pages redirect
 * here, since sending them to /login would bounce straight back while the
 * access token is still valid.
 */
export function GET(req: NextRequest) {
  return handle(req, async () => {
    await revokeByRawToken(req.cookies.get(REFRESH_COOKIE)?.value);
    const res = NextResponse.redirect(new URL("/login", req.url));
    clearAuthCookies(res);
    return res;
  });
}

export function POST(req: NextRequest) {
  return handle(req, async () => {
    await revokeByRawToken(req.cookies.get(REFRESH_COOKIE)?.value);
    const res = NextResponse.json({ ok: true });
    clearAuthCookies(res);
    return res;
  });
}
