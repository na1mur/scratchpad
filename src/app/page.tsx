import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "cn";
import * as motion from "motion/react-client";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/logo";
import { LanguageIcon } from "@/components/language-icon";
import { GraphBackdrop } from "@/components/landing/graph-backdrop";
import { HintLadder } from "@/components/landing/hint-ladder";
import { landingFonts } from "@/components/landing/fonts";
import { LandingHeader } from "@/components/landing/landing-header";
import { Highlight, MotionRoot, WordHeading } from "@/components/landing/motion";
import { NotebookTranscript } from "@/components/landing/notebook-transcript";
import { ScrollToTop } from "@/components/landing/scroll-to-top";
import { SketchSpecimen } from "@/components/landing/sketch-specimen";
import { TestRunSpecimen } from "@/components/landing/test-run-specimen";
import { TraceSpecimen } from "@/components/landing/trace-specimen";
import { LANGUAGES } from "@/lib/languages";

const inkButton = "bg-ink text-paper hover:bg-ink/85";
const container = "mx-auto w-full max-w-7xl px-4 sm:px-6";
// Header height; the hero's grid backdrop reaches up behind it by this much.
const HEADER_H = "4.25rem";
const heading = "text-display text-4xl sm:text-5xl";

const footerLink =
  "rounded-sm outline-none hover:text-ink focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-pen-blue/60";

const EASE = [0.22, 1, 0.36, 1] as const;
// The hero plays once on load, top to bottom.
const enter = (delay: number) => ({
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 1.6, delay, ease: EASE },
});
// Everything below the hero eases in once, as it scrolls into view.
const reveal = (delay = 0) => ({
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "0px 0px -80px 0px" },
  transition: { duration: 1.5, delay, ease: EASE },
});
// Buttons lift a little on hover and press in on click.
const press = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.97 },
  transition: { type: "spring", stiffness: 500, damping: 30 },
} as const;

const SHORT_LABELS: Record<string, string> = { pseudocode: "Pseudo-code" };

const EXTRAS = [
  {
    title: "Paste a link",
    text: "Scratchpad reads the statement from LeetCode, Codeforces, AtCoder, GeeksforGeeks, CodeChef, HackerRank, Naukri Code360 or any other page. You can edit it before you save.",
  },
  {
    title: "Ask beside the run",
    text: "Chat about any step without leaving the animation. It answers what you asked: an explanation, a hint, or the fix when you request it.",
  },
  {
    title: "Share a link",
    text: "Make one attempt or solution public. Visitors can read it and copy the problem into their own account. Unshare it and the link stops working for good.",
  },
  {
    title: "Keep a streak",
    text: "Your profile shows a year of practice with current and longest streaks, counted by your own time zone.",
  },
];

export const metadata: Metadata = {
  title: { absolute: "Scratchpad: see exactly where your approach breaks" },
  openGraph: {
    type: "website",
    title: "Scratchpad: see exactly where your approach breaks",
    description:
      "Write pseudo-code or real code, photograph your notebook or sketch the state, and watch it run step by step to find where it goes wrong. Hints first, and the solution only when you ask for it.",
  },
};

export default function Home() {
  return (
    <MotionRoot>
    <div className={cn(landingFonts, "flex flex-1 flex-col bg-paper text-ink")}>
      <LandingHeader height={HEADER_H} />
      <ScrollToTop />

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
              <WordHeading
                parts={["See", "exactly", { highlight: "where" }, "your", "approach", "breaks."]}
                className="text-display text-[3.25rem] text-balance sm:text-[4.5rem] xl:text-[5rem]"
              />
              <motion.p {...enter(1.3)} className="max-w-[34rem] text-lg leading-7 text-ink/75">
                Write pseudo-code or real code, photograph your notebook, or sketch the state. Scratchpad runs it on
                small inputs, animates every loop, and marks the step where it goes wrong. You get hints, not answers,
                until you ask for the solution.
              </motion.p>
              <motion.div {...enter(1.6)} className="flex flex-col items-start gap-3">
                <div className="flex flex-wrap gap-2">
                  <motion.span {...press} className="inline-flex">
                    <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), inkButton, "h-10 px-4 text-base")}>
                      Get started
                    </Link>
                  </motion.span>
                  <motion.span {...press} className="inline-flex">
                    <Link
                      href="/demo"
                      className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-4 text-base")}
                    >
                      See a demo
                    </Link>
                  </motion.span>
                </div>
                <p className="max-w-[34rem] text-sm leading-5 text-ink/70">
                  The demo needs no account. To run your own problems, sign in with OpenRouter, which has free
                  models, or add an API key from your AI provider.
                </p>
              </motion.div>
              <motion.div {...enter(1.9)} className="flex flex-col gap-3">
                <p className="text-sm text-ink/70">Hints in the language you think in</p>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-3">
                  {LANGUAGES.map((l) => (
                    <motion.li
                      key={l.id}
                      className="flex"
                      whileHover={{ y: -3, scale: 1.1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                    >
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
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </div>
            <TraceSpecimen />
          </div>
        </section>

        <section className="bg-sheet">
          <div className={cn(container, "grid gap-10 py-24 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:py-36")}>
            <motion.div {...reveal()} className="flex flex-col gap-5 lg:sticky lg:top-8 lg:self-start">
              <h2 className={heading}>Hints first, <Highlight>answers when you ask</Highlight>.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Scratchpad points at where your logic breaks and asks the question that gets you thinking again. Hints
                come one at a time, from vague to specific, and none of them is code you can copy.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Still stuck after a real try? Ask for the solution. It starts from your own attempt, shows what had to
                change, and explains the code line by line. Want another approach or a better Big-O? Ask for that too.
              </p>
            </motion.div>
            <motion.div {...reveal(0.12)}>
              <HintLadder />
            </motion.div>
          </div>
        </section>

        <section>
          <div className={cn(container, "grid items-center gap-10 py-24 lg:grid-cols-[7fr_5fr] lg:gap-16 lg:py-36")}>
            <motion.div {...reveal()} className="flex flex-col gap-5 lg:order-2">
              <h2 className={cn(heading, "text-balance")}>Test cases you can trust.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Most problems get three to six fixed test cases. Their answers come from running a reference solution,
                not from the model&apos;s guess, so a pass or a fail means what it says.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Open the Playground to run your own Python, JavaScript or TypeScript on them. It runs in your browser,
                spends no tokens and saves nothing. Turn on Show steps and the run plays frame by frame.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Tracing is automatic. Scratchpad runs the code and records each step, so the values you see come from a
                real run. Pseudo-code is translated into runnable code first.
              </p>
            </motion.div>
            <motion.div {...reveal(0.12)} className="min-w-0 lg:order-1">
              <TestRunSpecimen />
            </motion.div>
          </div>
        </section>

        <section className="bg-sheet">
          <div className={cn(container, "grid items-center gap-10 py-24 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:py-36")}>
            <motion.div {...reveal()} className="flex flex-col gap-5">
              <h2 className={cn(heading, "text-balance")}>Draw the state before you write the code.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Sketch is a canvas for data structures. Drop in arrays, stacks, queues, hash maps and list, tree or
                graph nodes, then add pointers, notes and freehand ink. A pointer binds to an index, and one past the
                end turns red.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Export a PNG, or choose Draft an attempt. A vision model reads your drawing and fills in a draft for
                you to check. Nothing is submitted until you say so.
              </p>
            </motion.div>
            <motion.div {...reveal(0.12)} className="min-w-0">
              <SketchSpecimen />
            </motion.div>
          </div>
        </section>

        <section>
          <div className={cn(container, "py-24 lg:py-36")}>
            <motion.div {...reveal()} className="mb-12 flex max-w-3xl flex-col gap-5">
              <h2 className={cn(heading, "text-balance")}>Start from <Highlight>the page in front of you</Highlight>.</h2>
              <p className="text-lg leading-7 text-ink/75">
                Photograph your notebook and Scratchpad types it out exactly as written, mistakes included. You check
                the text before it runs, so the trace follows what you actually wrote.
              </p>
            </motion.div>
            <motion.div {...reveal(0.1)}>
              <NotebookTranscript />
            </motion.div>
          </div>
        </section>

        <section className="bg-sheet">
          <div className={cn(container, "grid gap-12 py-24 lg:grid-cols-2 lg:gap-0 lg:py-36")}>
            <motion.div {...reveal()} className="flex flex-col gap-6 lg:border-r lg:border-ink/15 lg:pr-16">
              <h2 className={heading}>Explained in <Highlight>your language</Highlight>.</h2>
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
            </motion.div>
            <motion.div {...reveal(0.12)} className="flex flex-col gap-6 lg:pl-16">
              <h2 className={heading}>Run on <Highlight delay={0.45}>your own model</Highlight>.</h2>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Sign in with OpenRouter for hundreds of models, free ones included, with no key to copy. Or bring a
                key from OpenAI, Anthropic, Google Gemini, xAI, DeepSeek or any of ten other providers. Keys are
                stored encrypted and only ever used to call your model.
              </p>
              <p className="max-w-md text-lg leading-7 text-ink/75">
                Photos and sketches need a model that can read images, which you pick separately.
              </p>
            </motion.div>
          </div>
        </section>

        <section>
          <div className={cn(container, "grid gap-10 py-24 lg:grid-cols-[5fr_7fr] lg:gap-16 lg:py-36")}>
            <motion.h2 {...reveal()} className={cn(heading, "text-balance lg:sticky lg:top-8 lg:self-start")}>
              Small things that keep you practising.
            </motion.h2>
            <motion.dl {...reveal(0.12)} className="border-t border-ink/20">
              {EXTRAS.map((item) => (
                <div
                  key={item.title}
                  className="grid gap-1 border-b border-ink/20 py-5 sm:grid-cols-[10rem_1fr] sm:gap-6"
                >
                  <dt className="text-lg leading-7 font-medium">{item.title}</dt>
                  <dd className="max-w-md text-lg leading-7 text-ink/75">{item.text}</dd>
                </div>
              ))}
            </motion.dl>
          </div>
        </section>

        <section className="relative isolate">
          <GraphBackdrop seed={23} fade="up" className="absolute inset-0 -z-10" />
          <div className={cn(container, "flex flex-col items-start gap-8 py-28 lg:py-40")}>
            <motion.h2
              {...reveal()}
              className="text-display max-w-3xl text-[clamp(2.5rem,6vw,4.5rem)] text-balance"
            >
              Try it on the approach <Highlight>you&apos;re stuck on</Highlight>.
            </motion.h2>
            <motion.div {...reveal(0.12)} className="flex flex-wrap gap-2">
              <motion.span {...press} className="inline-flex">
                <Link href="/signup" className={cn(buttonVariants({ size: "lg" }), inkButton, "h-10 px-4 text-base")}>
                  Get started
                </Link>
              </motion.span>
              <motion.span {...press} className="inline-flex">
                <Link href="/demo" className={cn(buttonVariants({ size: "lg", variant: "outline" }), "h-10 px-4 text-base")}>
                  See a demo
                </Link>
              </motion.span>
            </motion.div>
          </div>
        </section>
      </main>

      <footer className="bg-sheet">
        <div className={cn(container, "flex flex-wrap items-center justify-between gap-x-6 gap-y-3 py-5 text-sm")}>
          <Logo href="/" height={28} />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-ink/70">
            <Link href="/demo" className={footerLink}>
              Demo
            </Link>
            <Link href="/login" className={footerLink}>
              Log in
            </Link>
            <Link href="/signup" className={footerLink}>
              Get started
            </Link>
            <a href="https://github.com/na1mur/scratchpad" className={footerLink}>
              GitHub
            </a>
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
    </MotionRoot>
  );
}
