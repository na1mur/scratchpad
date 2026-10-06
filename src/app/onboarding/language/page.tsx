import type { Metadata } from "next";
import { LanguageForm } from "@/components/settings/language-form";
import type { LanguageId } from "@/lib/languages";
import { getPageUser } from "@/lib/users";
import { StepHeader } from "../step-header";

export const metadata: Metadata = { title: "Pick your language" };

export default async function OnboardingLanguagePage() {
  const user = await getPageUser();
  return (
    <>
      <StepHeader
        step={1}
        title="Which language do you think in?"
        description="Explanations and hints will use this language's vocabulary, and your pseudo-code will be read with it in mind. You'll never get a solution in it."
      />
      <LanguageForm
        initial={(user.preferredLanguage as LanguageId | undefined) ?? null}
        submitLabel="Continue"
        onboarding
      />
    </>
  );
}
