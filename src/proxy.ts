import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ONBOARDING_PATHS, homeFor } from "@/lib/auth/routes";

const GUEST_PAGES = new Set(["/", "/login", "/signup"]);
// Open to everyone, logged in or not.
const PUBLIC_PAGES = new Set(["/demo"]);

// Verifies the access token only; never touches the database. Route handlers
// and pages re-check the session themselves.
export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const session = await verifyAccessToken(req.cookies.get(ACCESS_COOKIE)?.value);

  if (pathname.startsWith("/api/")) {
    const isPublicAuthRoute = pathname.startsWith("/api/auth/") && pathname !== "/api/auth/me";
    if (isPublicAuthRoute || session) return NextResponse.next();
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Please log in." } },
      { status: 401 },
    );
  }

  if (PUBLIC_PAGES.has(pathname)) return NextResponse.next();

  if (!session) {
    if (GUEST_PAGES.has(pathname)) return NextResponse.next();
    const refresh = new URL("/api/auth/refresh", req.url);
    refresh.searchParams.set("next", pathname + search);
    return NextResponse.redirect(refresh);
  }

  if (GUEST_PAGES.has(pathname)) {
    return NextResponse.redirect(new URL(homeFor(session.onboardingStep), req.url));
  }

  const step = session.onboardingStep;
  if (step !== "done") {
    const target = ONBOARDING_PATHS[step];
    // Going back to an earlier onboarding step is fine; skipping ahead isn't.
    const allowed = pathname === target || (step === "provider" && pathname === ONBOARDING_PATHS.language);
    if (!allowed) return NextResponse.redirect(new URL(target, req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
