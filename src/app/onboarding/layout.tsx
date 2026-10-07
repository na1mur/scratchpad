import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";

export default function OnboardingLayout({ children }: LayoutProps<"/onboarding">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo height={36} priority />
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 py-10">{children}</main>
    </div>
  );
}
