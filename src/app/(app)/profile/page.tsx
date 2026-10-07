import type { Metadata } from "next";
import { LogoutButton } from "@/components/logout-button";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ProfileForm } from "@/components/profile/profile-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveAvatarUrl } from "@/lib/avatar";
import { r2Enabled } from "@/lib/env";
import { getPageUser } from "@/lib/users";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getPageUser();
  const avatarUrl = await resolveAvatarUrl(user);
  const memberSince = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(user.createdAt);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <Card>
        <CardHeader>
          <CardTitle>Your profile</CardTitle>
          <CardDescription>Your photo and name, as shown in the header.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <AvatarUploader
            avatarUrl={avatarUrl}
            hasUpload={Boolean(user.avatarKey)}
            hasGoogle={Boolean(user.googlePicture)}
            uploadsEnabled={r2Enabled}
          />
          <ProfileForm name={user.name ?? null} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>How you sign in to Scratchpad.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3 text-sm">
            <dt className="text-muted-foreground">Email</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <span className="break-all">{user.email}</span>
              {user.emailVerified !== false && <Badge variant="secondary">Verified</Badge>}
            </dd>
            <dt className="text-muted-foreground">Sign-in methods</dt>
            <dd className="flex flex-wrap gap-2">
              {user.passwordHash && <Badge variant="outline">Email and password</Badge>}
              {user.googleId && <Badge variant="outline">Google</Badge>}
            </dd>
            <dt className="text-muted-foreground">Member since</dt>
            <dd>{memberSince}</dd>
          </dl>
          <div>
            <LogoutButton withLabel />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
