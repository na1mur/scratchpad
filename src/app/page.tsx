import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { LanguageIcon } from "@/components/language-icon";
import { HintLadder } from "@/components/landing/hint-ladder";
import { landingFonts } from "@/components/landing/fonts";
import { NotebookTranscript } from "@/components/landing/notebook-transcript";
import { TraceSpecimen } from "@/components/landing/trace-specimen";
import { LANGUAGES } from "@/lib/languages";

const inkButton = "bg-ink text-paper hover:bg-ink/85";
const container = "mx-auto w-full max-w-7xl px-6";
const heading = "text-display text-4xl sm:text-5xl";

const SHORT_LABELS: Record<string, string> = { pseudocode: "Pseudo-code" };

export default function Home() {
  return (
    <div className={cn(landingFonts, "flex flex-1 flex-col bg-paper text-ink")}>
      <div className="relative isolate">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-graph [mask-image:linear-gradient(to_bottom,black_55%,transparent)]"
        />
        <header className={cn(container, "flex items-center justify-between py-4")}>
          <Logo href="/" height={36} priority />
          <nav aria-label="Main" className="flex items-center gap-1">
            <Link href="/demo" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>
              Demo
            </Link>
            <Link href="/login" className={buttonVariants({ variant: "ghost" })}>
              Log in
            </Link>
            <Link href="/signup" className={cn(buttonVariants(), inkButton)}>
              Get started
            </Link>
            <ThemeToggle />
          </nav>
        </header>

        <main>
          <section className={cn(container, "grid items-center gap-12 pt-10 pb-20 sm:pt-16 xl:grid-cols-[5fr_7fr] xl:gap-14")}>
            <div className="flex flex-col items-start gap-6">
              <h1 className="text-display text-[3.25rem] text-balance sm:text-[4.5rem] xl:text-[5rem]">
                See exactly where your approach breaks.
              </h1>
              <p className="max-w-[34rem] text-lg leading-7 text-ink/75">
                Paste your pseudo-code and your reasoning, or photograph your notebook. Scratchpad runs it on a small
                input, animates every loop, and marks the step where it goes wrong. It never hands you the answer.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), inkButton, "h-10 px-4 text-base")}>
                  Get started
                </Link>
                <Link
                  href="/demo"
                  className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-4 text-base")}
                >
                  See a demo
                </Link>
              </div>
            </div>
            <TraceSpecimen />
          </section>
        </main>
      </div>

      <section className="border-y border-ink/15">
        <div className={cn(container, "grid gap-10 py-20 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:py-28")}>
          <div className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
            <h2 className={heading}>Hints, never answers.</h2>
            <p className="max-w-md text-lg leading-7 text-ink/75">
              Scratchpad points at where your logic breaks and asks the question that gets you thinking again. Hints
              come one at a time, from vague to specific, and none of them is code you can copy.
            </p>
          </div>
          <HintLadder />
        </div>
      </section>

      <section className={cn(container, "py-20 lg:py-28")}>
        <div className="mb-12 flex max-w-3xl flex-col gap-5">
          <h2 className={cn(heading, "text-balance")}>Start from the page in front of you.</h2>
          <p className="text-lg leading-7 text-ink/75">
            Photograph your notebook and Scratchpad types it out exactly as written, mistakes included. You check the
            text before it runs, so the trace follows what you actually wrote.
          </p>
        </div>
        <NotebookTranscript />
      </section>

      <section className="border-y border-ink/15">
        <div className={cn(container, "grid gap-12 py-20 lg:grid-cols-2 lg:gap-0 lg:py-28")}>
          <div className="flex flex-col gap-6 lg:border-r lg:border-ink/15 lg:pr-16">
            <h2 className={heading}>Explained in your language.</h2>
            <p className="max-w-md text-lg leading-7 text-ink/75">
              Pick the language you think in and the hints use its vocabulary. Or stay with plain pseudo-code.
            </p>
            <ul className="flex flex-wrap gap-x-6 gap-y-3">
              {LANGUAGES.map((l) => (
                <li key={l.id} className="flex items-center gap-2">
                  <LanguageIcon id={l.id} />
                  <span>{SHORT_LABELS[l.id] ?? l.label}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-6 lg:pl-16">
            <h2 className={heading}>Run on your own model.</h2>
            <p className="max-w-md text-lg leading-7 text-ink/75">
              Bring a key from OpenAI, Anthropic, Google Gemini, xAI, Mistral, DeepSeek or any of ten other providers.
              Your key is stored encrypted and only ever used to call your model.
            </p>
          </div>
        </div>
      </section>

      <section className="relative isolate">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-graph [mask-image:linear-gradient(to_top,black_40%,transparent)]"
        />
        <div className={cn(container, "flex flex-col items-start gap-8 py-24 lg:py-32")}>
          <h2 className="text-display max-w-3xl text-[clamp(2.5rem,6vw,4.5rem)] text-balance">
            Try it on the approach you&apos;re stuck on.
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), inkButton, "h-10 px-4 text-base")}>
              Create an account
            </Link>
            <Link href="/demo" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-4 text-base")}>
              See a demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-ink/15">
        <div className={cn(container, "flex items-center justify-between py-5 text-sm")}>
          <Logo href="/" height={28} />
          <nav aria-label="Footer" className="flex gap-5 text-ink/70">
            <Link href="/demo" className="hover:text-ink">
              Demo
            </Link>
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-ink">
              Sign up
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
