import Link from "next/link";
import { BugIcon, PlayIcon, SparklesIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

const features = [
  {
    icon: PlayIcon,
    title: "Watch your idea run",
    body: "Your pseudo-code is traced on a small input and animated step by step, loop by loop.",
  },
  {
    icon: BugIcon,
    title: "See where it breaks",
    body: "The exact step where your reasoning diverges is marked, with an explanation of why.",
  },
  {
    icon: SparklesIcon,
    title: "Hints, never answers",
    body: "Progressive nudges on how to think about the problem. The solution stays yours to find.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="font-semibold tracking-tight">DSA Buddy</span>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link href="/login" className={buttonVariants({ variant: "outline" })}>
            Log in
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center gap-12 px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-4">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Find out <span className="text-viz-error">where</span> your approach breaks.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Paste your pseudo-code and reasoning, or a photo of your notebook. DSA Buddy simulates it,
            animates every step, and explains what goes wrong without giving away the solution.
          </p>
          <div className="flex gap-2">
            <Link href="/signup" className={buttonVariants({ size: "lg" })}>
              Get started
            </Link>
            <Link href="/demo" className={buttonVariants({ size: "lg", variant: "outline" })}>
              See a demo
            </Link>
          </div>
        </div>
        <div className="grid w-full gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-5 text-left">
              <f.icon className="mb-3 size-5 text-muted-foreground" />
              <h2 className="font-medium">{f.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
