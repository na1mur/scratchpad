import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheckIcon } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";
import { ActivityCard } from "@/components/profile/activity-card";
import { AvatarUploader } from "@/components/profile/avatar-uploader";
import { ProfileForm } from "@/components/profile/profile-form";
import { RecentProblems } from "@/components/profile/recent-problems";
import { ReplayToursButton } from "@/components/tour/replay-tours-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { resolveAvatarUrl } from "@/lib/avatar";
import { r2Enabled } from "@/lib/env";
import { recentProblems } from "@/lib/problems";
import { getPageUser } from "@/lib/users";
import { isAdmin } from "@/models/User";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await getPageUser();
  const [avatarUrl, recent] = await Promise.all([resolveAvatarUrl(user), recentProblems(String(user._id), 6)]);
  const now = new Date().getTime();
  const memberSince = new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(user.createdAt);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Profile</h1>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)] lg:items-start">
        <div className="order-last flex flex-col gap-6 lg:order-first">
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
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <span className="break-all">{user.email}</span>
                    {user.emailVerified !== false && <Badge variant="secondary">Verified</Badge>}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Sign-in methods</dt>
                  <dd className="flex flex-wrap gap-2">
                    {user.passwordHash && <Badge variant="outline">Email and password</Badge>}
                    {user.googleId && <Badge variant="outline">Google</Badge>}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-muted-foreground">Member since</dt>
                  <dd>{memberSince}</dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {isAdmin(user) && (
                  <Link href="/admin" className={buttonVariants({ variant: "outline" })}>
                    <ShieldCheckIcon /> Admin dashboard
                  </Link>
                )}
                <ReplayToursButton />
                <LogoutButton withLabel />
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="flex flex-col gap-6">
          <ActivityCard />
          <RecentProblems problems={recent} now={now} />
        </div>
      </div>
    </main>
  );
}
