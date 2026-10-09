import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftIcon } from "lucide-react";
import { LanguageForm } from "@/components/settings/language-form";
import { ProviderForm } from "@/components/settings/provider-form";
import { ProviderSummary } from "@/components/settings/provider-summary";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LanguageId } from "@/lib/languages";
import { safeNextPath } from "@/lib/schemas/auth";
import { publicUser } from "@/lib/serializers";
import { getPageUser } from "@/lib/users";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { returnTo: rawReturnTo } = await searchParams;
  const candidate = typeof rawReturnTo === "string" && rawReturnTo.length <= 500 ? safeNextPath(rawReturnTo, "") : "";
  // Only same-site paths, and never Settings itself.
  const returnTo = candidate && !candidate.startsWith("/settings") ? candidate : null;
  const user = publicUser(await getPageUser());
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      {returnTo && (
        <div className="flex flex-col gap-3 rounded-lg border bg-tile p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>Pick another model below and save. We&apos;ll take you back to where you left off.</p>
          <Link href={returnTo} className={buttonVariants({ variant: "outline", className: "shrink-0" })}>
            <ArrowLeftIcon /> Go back without changing
          </Link>
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Language</CardTitle>
          <CardDescription>Used for explanations, hints, and reading your pseudo-code.</CardDescription>
        </CardHeader>
        <CardContent>
          <LanguageForm initial={user.preferredLanguage as LanguageId | null} submitLabel="Save language" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>AI provider</CardTitle>
          <CardDescription>
            Sign in with OpenRouter or paste a key from any provider. Keys are encrypted at rest, and only the last
            four characters are ever shown back to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <ProviderSummary ai={user.ai} />
          <ProviderForm ai={user.ai} returnTo={returnTo} />
        </CardContent>
      </Card>
    </main>
  );
}
