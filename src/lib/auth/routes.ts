import type { OnboardingStep } from "@/models/User";

export const ONBOARDING_PATHS: Record<Exclude<OnboardingStep, "done">, string> = {
  language: "/onboarding/language",
  provider: "/onboarding/provider",
};

/** Where a user should land given how far through onboarding they are. */
export function homeFor(step: OnboardingStep): string {
  return step === "done" ? "/problems" : ONBOARDING_PATHS[step];
}
