import "server-only";
import { Google } from "arctic";
import { env, googleEnabled } from "@/lib/env";

// Short-lived cookies carrying the OAuth round trip. They are only sent to the
// Google routes. SameSite=Lax still sends them on Google's top-level redirect back.
export const GOOGLE_STATE_COOKIE = "dsab_g_state";
export const GOOGLE_VERIFIER_COOKIE = "dsab_g_verifier";
export const GOOGLE_NEXT_COOKIE = "dsab_g_next";
export const GOOGLE_COOKIE_PATH = "/api/auth/google";
export const GOOGLE_COOKIE_MAX_AGE = 10 * 60;

export const GOOGLE_SCOPES = ["openid", "email", "profile"];

export function googleClient(): Google | null {
  if (!googleEnabled) return null;
  return new Google(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    new URL("/api/auth/google/callback", env.APP_URL).toString(),
  );
}
