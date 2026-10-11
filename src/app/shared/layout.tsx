import Link from "next/link";
import { Logo } from "@/components/logo";
import { PendingForkRunner } from "@/components/share/pending-fork-runner";
import { ThemeToggle } from "@/components/theme-toggle";
import { buttonVariants } from "@/components/ui/button";
import { getSession } from "@/lib/auth/session";

/** Public pages for shared attempts and solutions: open to everyone, signed in or not. */
export default async function SharedLayout({ children }: LayoutProps<"/shared">) {
  const session = await getSession();
  const member = session?.onboardingStep === "done";
  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="flex h-14 items-center gap-6 px-4 sm:px-6">
          <Logo href={session ? "/problems" : "/"} height={28} priority />
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            {session ? (
              <Link href="/problems" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                Your problems
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonVariants({ variant: "ghost", size: "sm" })}>
                  Log in
                </Link>
                <Link href="/signup" className={buttonVariants({ variant: "brand", size: "sm" })}>
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </header>
      {children}
      {member && <PendingForkRunner />}
    </div>
  );
}
