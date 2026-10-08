import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { LanguageIcon } from "@/components/language-icon";
import { GraphBackdrop } from "@/components/landing/graph-backdrop";
import { HintLadder } from "@/components/landing/hint-ladder";
import { landingFonts } from "@/components/landing/fonts";
import { NotebookTranscript } from "@/components/landing/notebook-transcript";
import { TraceSpecimen } from "@/components/landing/trace-specimen";
import { LANGUAGES } from "@/lib/languages";

const inkButton = "bg-ink text-paper hover:bg-ink/85";
const container = "mx-auto w-full max-w-7xl px-4 sm:px-6";
// Header height; the hero's grid backdrop reaches up behind it by this much.
const HEADER_H = "4.25rem";
const heading = "text-display text-4xl sm:text-5xl";

const footerLink =
  "rounded-sm outline-none hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-pen-blue/60";

const SHORT_LABELS: Record<string, string> = { pseudocode: "Pseudo-code" };

export const metadata: Metadata = {
  title: { absolute: "Scratchpad: see exactly where your approach breaks" },
  openGraph: {
    type: "website",
    title: "Scratchpad: see exactly where your approach breaks",
    description:
      "Paste your pseudo-code and reasoning, watch it run step by step, and find the step where it goes wrong. Hints first, and the solution only when you ask for it.",
  },
};

export default function Home() {
  return (
    <div className={cn(landingFonts, "flex flex-1 flex-col bg-paper text-ink")}>
      <header
        style={{ height: HEADER_H }}
        className={cn(container, "relative z-10 flex items-center justify-between")}
      >
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
      </header>

      <main>
        <section
          style={{ minHeight: `calc(100dvh - ${HEADER_H})` }}
          className="relative isolate flex items-center"
        >
          <GraphBackdrop
            seed={7}
            fade="down"
            style={{ top: `-${HEADER_H}` }}
            className="absolute inset-x-0 bottom-0 -z-10"
          />
          <div className={cn(container, "grid items-center gap-12 pt-10 pb-20 sm:pt-16 xl:grid-cols-[5fr_7fr] xl:gap-14")}>
            <div className="flex flex-col items-start gap-6">
              <h1 className="text-display text-[3.25rem] text-balance sm:text-[4.5rem] xl:text-[5rem]">
                See exactly <span className="highlight">where</span> your approach breaks.
              </h1>
              <p className="max-w-[34rem] text-lg leading-7 text-ink/75">
                Paste your pseudo-code and your reasoning, or photograph your notebook. Scratchpad runs it on a small
                input, animates every loop, and marks the step where it goes wrong. It gives hints, not answers, until you
                ask for the solution.
              </p>
              <div className="flex flex-col items-start gap-3">
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
                <p className="max-w-[34rem] text-sm leading-5 text-ink/70">
                  The demo needs no account. To run your own problems, sign in with OpenRouter, which has free
                  models, or add an API key from your AI provider.
                </p>
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-sm text-ink/70">Hints in the language you think in</p>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  {LANGUAGES.map((l) => (
                    <li key={l.id} className="flex">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              tabIndex={0}
                              className="flex rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-pen-blue/60"
                            />
                          }
                        >
                          <LanguageIcon id={l.id} className="size-7" />
                          <span className="sr-only">{SHORT_LABELS[l.id] ?? l.label}</span>
                        </TooltipTrigger>
                        <TooltipContent>{SHORT_LABELS[l.id] ?? l.label}</TooltipContent>
                      </Tooltip>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <TraceSpecimen />
          </div>
        </section>

        <section className="bg-sheet">
          <div className={cn(container, "grid gap-12 py-24 lg:grid-cols-2 lg:gap-0 lg:py-36")}>
            <div className="flex flex-col gap-6 lg:border-r lg:border-ink/15 lg:pr-16">
              <h2 className={heading}>Explained in <span className="highlight">your language</span>.</h2>
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
              <h2 className={heading}>Run on <span className="highlight">your own model</span>.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Sign in with OpenRouter for hundreds of models, free ones included, with no key to copy. Or bring a
                key from OpenAI, Anthropic, Google Gemini, xAI, DeepSeek or any of ten other providers. Keys are
                stored encrypted and only ever used to call your model.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className={cn(container, "grid gap-10 py-24 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:py-36")}>
            <div className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
              <h2 className={heading}>Hints first, <span className="highlight">answers when you ask</span>.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Scratchpad points at where your logic breaks and asks the question that gets you thinking again. Hints
                come one at a time, from vague to specific, and none of them is code you can copy.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Still stuck after a real try? Ask for the solution. It starts from your own attempt and shows what had
                to change, then explains the code line by line and animates every loop iteration. Want another
                approach or a better Big-O? Ask for that too.
              </p>
            </div>
            <HintLadder />
          </div>
        </section>

        <section className="bg-sheet">
          <div className={cn(container, "py-24 lg:py-36")}>
            <div className="mb-12 flex max-w-3xl flex-col gap-5">
              <h2 className={cn(heading, "text-balance")}>Start from <span className="highlight">the page in front of you</span>.</h2>
              <p className="text-lg leading-7 text-ink/75">
                Photograph your notebook and Scratchpad types it out exactly as written, mistakes included. You check
                the text before it runs, so the trace follows what you actually wrote.
              </p>
            </div>
            <NotebookTranscript />
          </div>
        </section>

        <section className="relative isolate">
          <GraphBackdrop seed={23} fade="up" className="absolute inset-0 -z-10" />
          <div className={cn(container, "flex flex-col items-start gap-8 py-28 lg:py-40")}>
            <h2 className="text-display max-w-3xl text-[clamp(2.5rem,6vw,4.5rem)] text-balance">
              Try it on the approach <span className="highlight">you&apos;re stuck on</span>.
            </h2>
            <div className="flex flex-wrap gap-2">
              <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), inkButton, "h-10 px-4 text-base")}>
                Get started
              </Link>
              <Link href="/demo" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-4 text-base")}>
                See a demo
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-sheet">
        <div className={cn(container, "flex items-center justify-between py-5 text-sm")}>
          <Logo href="/" height={28} />
          <nav aria-label="Footer" className="flex gap-5 text-ink/70">
            <Link href="/demo" className={footerLink}>
              Demo
            </Link>
            <Link href="/login" className={footerLink}>
              Log in
            </Link>
            <Link href="/signup" className={footerLink}>
              Get started
            </Link>
            <Link href="/privacy-policy" className={footerLink}>
              Privacy
            </Link>
            <Link href="/terms-of-service" className={footerLink}>
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
