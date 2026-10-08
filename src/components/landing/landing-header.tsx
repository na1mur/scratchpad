"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

const inkButton = "bg-ink text-paper hover:bg-ink/85";
const container = "mx-auto w-full max-w-7xl px-4 sm:px-6";

// Fixed top bar: plain over the hero, blurred once the page has scrolled.
export function LandingHeader({ height }: { height: string }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 0);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  return (
    <>
      {/* The header is out of flow, so this keeps the space it used to take. */}
      <div aria-hidden style={{ height }} />
      <header
        style={{ height }}
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-[background-color,backdrop-filter] duration-300 ease-out",
          scrolled ? "bg-paper/40 backdrop-blur-3xl" : "bg-transparent backdrop-blur-none",
        )}
      >
        <div className={cn(container, "flex h-full items-center justify-between")}>
          <Logo href="/" height={36} priority />
          <nav aria-label="Main" className="flex items-center gap-1">
            <Link href="/demo" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>
              Demo
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
              Log in
            </Link>
            {/* Hidden on phones, where the logo, Log in and the toggle already fill the row; the hero has the same CTA. */}
            <Link href="/signup" className={cn(buttonVariants(), inkButton, "hidden sm:inline-flex")}>
              Get started
            </Link>
            <ThemeToggle />
          </nav>
        </div>
      </header>
    </>
  );
}
