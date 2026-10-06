import { AppHeader } from "@/components/app-header";
import { getPageUser } from "@/lib/users";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getPageUser();
  return (
    <div className="flex flex-1 flex-col">
      <AppHeader email={user.email} />
      {children}
    </div>
  );
}
