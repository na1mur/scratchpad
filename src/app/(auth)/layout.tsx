import { cn } from "cn";
import { landingFonts } from "@/components/landing/fonts";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

/** The page decides the split (see `AuthScreen`); the logo and theme toggle stay in the corners on every screen. */
export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className={cn(landingFonts, "relative flex flex-1 flex-col bg-paper text-ink")}>
      <header className="absolute inset-x-0 top-0 z-10 flex h-[4.25rem] items-center justify-between px-5 sm:px-10">
        <Logo href="/" height={32} priority />
        <ThemeToggle />
      </header>
      {children}
    </div>
  );
}
