import type { NextResponse } from "next/server";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from "@/lib/auth/jwt";

export const ACCESS_COOKIE = "dsab_at";
export const REFRESH_COOKIE = "dsab_rt";
// The refresh cookie is only ever sent to the auth routes.
const REFRESH_PATH = "/api/auth";

const secure = process.env.NODE_ENV === "production";

export function setAccessCookie(res: NextResponse, token: string) {
  res.cookies.set(ACCESS_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: ACCESS_TTL_SECONDS,
  });
}

export function setAuthCookies(res: NextResponse, tokens: { access: string; refresh: string }) {
  setAccessCookie(res, tokens.access);
  res.cookies.set(REFRESH_COOKIE, tokens.refresh, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: REFRESH_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearAuthCookies(res: NextResponse) {
  res.cookies.set(ACCESS_COOKIE, "", { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 0 });
  res.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: REFRESH_PATH,
    maxAge: 0,
  });
}
