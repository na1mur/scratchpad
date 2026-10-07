/** Error codes the login page knows how to explain (`/login?error=<code>`). */
export const GOOGLE_ERRORS = {
  google_unavailable: "Google sign-in isn't set up on this server.",
  google_failed: "Google sign-in didn't work. Please try again.",
  google_cancelled: "Google sign-in was cancelled.",
  google_unverified: "Your Google email isn't verified, so we can't use it to sign you in.",
  google_conflict: "That email is already linked to a different Google account.",
} as const;
export type GoogleErrorCode = keyof typeof GOOGLE_ERRORS;
