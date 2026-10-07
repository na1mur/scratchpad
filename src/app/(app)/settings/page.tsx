import type { Metadata } from "next";
import { LogoutButton } from "@/components/logout-button";
import { LanguageForm } from "@/components/settings/language-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { ProviderForm } from "@/components/settings/provider-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { LanguageId } from "@/lib/languages";
import { publicUser } from "@/lib/serializers";
import { getPageUser } from "@/lib/users";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = publicUser(await getPageUser());
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
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
            Your key is encrypted at rest. Only the last four characters are ever shown back to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProviderForm ai={user.ai} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in as {user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ProfileForm name={user.name} />
          <div>
            <LogoutButton withLabel />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
