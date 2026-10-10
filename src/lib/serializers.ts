import "server-only";
import type { UserDoc } from "@/models/User";

/** The only user shape that leaves the server. Never includes key material. */
export function publicUser(user: UserDoc) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name ?? null,
    preferredLanguage: user.preferredLanguage ?? null,
    onboardingStep: user.onboardingStep,
    ai: user.ai
      ? {
          provider: user.ai.provider,
          model: user.ai.model,
          // Null once the learner deleted the key in use and hasn't activated another.
          keyLast4: user.ai.apiKey ? (user.ai.keyLast4 ?? null) : null,
          keyId: user.ai.apiKey && user.ai.keyId ? String(user.ai.keyId) : null,
          vision: user.ai.vision
            ? {
                provider: user.ai.vision.provider,
                model: user.ai.vision.model,
                hasOwnKey: Boolean(user.ai.vision.apiKey),
                keyLast4: user.ai.vision.keyLast4 ?? null,
                keyId: user.ai.vision.apiKey && user.ai.vision.keyId ? String(user.ai.vision.keyId) : null,
              }
            : null,
        }
      : null,
    search: user.search
      ? {
          enabled: user.search.enabled,
          keyLast4: user.search.apiKey ? (user.search.keyLast4 ?? null) : null,
          keyId: user.search.apiKey && user.search.keyId ? String(user.search.keyId) : null,
        }
      : null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
