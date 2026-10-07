import type { Metadata } from "next";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { DemoPlayer } from "./demo-player";

export const metadata: Metadata = { title: "Demo" };

export default function DemoPage() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Logo href="/" height={36} priority />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-16 sm:px-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">See it in action</h1>
          <p className="text-sm text-muted-foreground">
            Four buggy approaches, traced step by step. Use ←/→ to step and space to play.
          </p>
        </div>
        <DemoPlayer />
      </main>
    </div>
  );
}
