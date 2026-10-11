import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, SESSION_HINT_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken } from "@/lib/auth/jwt";
import { ONBOARDING_PATHS, homeFor } from "@/lib/auth/routes";

const GUEST_PAGES = new Set(["/", "/login", "/signup", "/verify-email", "/forgot-password"]);
// Open to everyone, logged in or not.
const PUBLIC_PAGES = new Set([
  "/demo",
  "/privacy-policy",
  "/terms-of-service",
  // Google Search Console ownership file (public/), needed for OAuth verification.
  "/googled67951643ef37654.html",
]);

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

  // Shared attempts and solutions: the page itself checks that the link is still shared.
  if (PUBLIC_PAGES.has(pathname) || pathname.startsWith("/shared/")) return NextResponse.next();

  if (!session) {
    const refresh = new URL("/api/auth/refresh", req.url);
    if (GUEST_PAGES.has(pathname)) {
      // A returning user whose access token has expired: refresh instead of
      // showing the signed-out page. A failed refresh clears the hint.
      if (!req.cookies.has(SESSION_HINT_COOKIE)) return NextResponse.next();
      const next = pathname === "/login" ? req.nextUrl.searchParams.get("next") : null;
      if (next) refresh.searchParams.set("next", next);
      return NextResponse.redirect(refresh);
    }
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
