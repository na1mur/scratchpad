import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { ProviderForm } from "@/components/settings/provider-form";
import { publicUser } from "@/lib/serializers";
import { getPageUser } from "@/lib/users";
import { StepHeader } from "../step-header";

export const metadata: Metadata = { title: "Connect an AI provider" };

export default async function OnboardingProviderPage() {
  const user = publicUser(await getPageUser());
  return (
    <>
      <Link
        href="/onboarding/language"
        className="mb-4 flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> Back
      </Link>
      <StepHeader
        step={2}
        title="Bring your own AI key"
        description="Scratchpad runs on your own OpenAI, Anthropic or OpenRouter account. You can change this later in Settings."
      />
      <ProviderForm ai={user.ai} onboarding />
    </>
  );
}
