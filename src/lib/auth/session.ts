import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACCESS_COOKIE } from "@/lib/auth/cookies";
import { verifyAccessToken, type AccessPayload } from "@/lib/auth/jwt";

export type Session = { userId: string; onboardingStep: AccessPayload["onboardingStep"] };

/** Reads and verifies the access token cookie. Never touches the database. */
export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const payload = await verifyAccessToken(store.get(ACCESS_COOKIE)?.value);
  return payload ? { userId: payload.sub, onboardingStep: payload.onboardingStep } : null;
}

/** For server components: the proxy already gates pages, this is defense in depth. */
export async function requirePageSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
