import { AppHeader } from "@/components/app-header";
import { resolveAvatarUrl } from "@/lib/avatar";
import { getPageUser } from "@/lib/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  const avatarUrl = await resolveAvatarUrl(user);
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={user.email} name={user.name ?? null} avatarUrl={avatarUrl} />
      {children}
    </div>
  );
}
