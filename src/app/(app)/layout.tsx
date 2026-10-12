import { AppHeader } from "@/components/app-header";
import { PendingForkRunner } from "@/components/share/pending-fork-runner";
import { resolveAvatarUrl } from "@/lib/avatar";
import { getPageUser } from "@/lib/users";
import { isAdmin } from "@/models/User";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  const avatarUrl = await resolveAvatarUrl(user);
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={user.email} name={user.name ?? null} avatarUrl={avatarUrl} isAdmin={isAdmin(user)} />
      {children}
      <PendingForkRunner />
    </div>
  );
}
