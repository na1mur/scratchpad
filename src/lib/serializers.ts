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
          keyLast4: user.ai.keyLast4,
          vision: user.ai.vision
            ? {
                provider: user.ai.vision.provider,
                model: user.ai.vision.model,
                hasOwnKey: Boolean(user.ai.vision.apiKey),
                keyLast4: user.ai.vision.keyLast4 ?? null,
              }
            : null,
        }
      : null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
