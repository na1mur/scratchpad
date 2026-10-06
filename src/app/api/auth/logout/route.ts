import { NextResponse, type NextRequest } from "next/server";
import { handle } from "@/lib/api";
import { REFRESH_COOKIE, clearAuthCookies } from "@/lib/auth/cookies";
import { revokeByRawToken } from "@/lib/auth/tokens";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    await revokeByRawToken(req.cookies.get(REFRESH_COOKIE)?.value);
    const res = NextResponse.json({ ok: true });
    clearAuthCookies(res);
    return res;
  });
}
