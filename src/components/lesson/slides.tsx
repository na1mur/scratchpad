"use client";

import Link from "next/link";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  ArrowRightIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ClockIcon,
  DatabaseIcon,
  HandIcon,
  LightbulbIcon,
  MessageCircleQuestionIcon,
  PauseIcon,
  PencilRulerIcon,
  PlayIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button, buttonVariants } from "@/components/ui/button";
import { StructureView } from "@/components/viz/StructureView";
import type { LessonCase, Slide } from "@/lib/ai/schemas/lesson";

/** Where a slide is: the frame of a walk, whether a prediction's answer is showing, whether a walk plays. */
export type SlideState = {
  frame: number;
  revealed: boolean;
  playing: boolean;
};

export type SlideControls = {
  setFrame: (frame: number) => void;
  reveal: () => void;
  togglePlay: () => void;
  next: () => void;
};

const appear = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.18 },
};

function Heading({ slide }: { slide: Slide }) {
  return (
    <header className="flex flex-col gap-1.5">
      {slide.label && <p className="text-xs font-semibold tracking-wider text-brand-strong uppercase">{slide.label}</p>}
      <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">{slide.title}</h2>
    </header>
  );
}

function Body({ children, className }: { children: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p className={cn("text-base leading-relaxed text-muted-foreground sm:text-lg", className)}>{children}</p>;
}

/**
 * One recorded state of a case, drawn with the walkthrough's renderers. `prevStepId` is the state shown
 * just before, so changes animate from it.
 */
export function LessonPicture({
  lessonCase,
  stepId,
  prevStepId,
  layoutId,
}: {
  lessonCase: LessonCase;
  stepId: string;
  prevStepId?: string;
  layoutId: string;
}) {
  const step = lessonCase.steps.find((s) => s.id === stepId) ?? lessonCase.steps[0];
  const prev = prevStepId ? lessonCase.steps.find((s) => s.id === prevStepId) : undefined;
  return (
    <LayoutGroup id={layoutId}>
      <div className="flex min-w-0 flex-col gap-3">
        {lessonCase.structures.map((st) => (
          <StructureView
            key={st.id}
            structure={st}
            step={step}
            prevStep={prev}
            history={lessonCase.steps.map((s) => s.states[st.id]).filter(Boolean)}
          />
        ))}
      </div>
    </LayoutGroup>
  );
}

function CaseChip({ lessonCase }: { lessonCase: LessonCase }) {
  return (
    <dl className="grid gap-x-3 gap-y-1 rounded-lg border bg-tile px-3 py-2 text-sm sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">Input</dt>
      <dd className="min-w-0 font-mono break-words">{lessonCase.input}</dd>
      <dt className="text-muted-foreground">Answer</dt>
      <dd className="min-w-0 font-mono break-words">{lessonCase.expectedOutput}</dd>
    </dl>
  );
}

/** Text beside a picture from `lg` up, above it on narrower screens. */
function Split({ text, picture }: { text: React.ReactNode; picture: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-center">
      <div className="flex min-w-0 flex-col gap-4">{text}</div>
      <div className="min-w-0">{picture}</div>
    </div>
  );
}

export function SlideView({
  slide,
  index,
  cases,
  state,
  controls,
  problemHref,
}: {
  slide: Slide;
  index: number;
  cases: LessonCase[];
  state: SlideState;
  controls: SlideControls;
  problemHref: string;
}) {
  const caseOf = (id: string) => cases.find((c) => c.id === id);
  const layoutId = `lesson-${index}`;

  switch (slide.kind) {
    case "text":
      return (
        <div className="flex max-w-3xl flex-col gap-5">
          <Heading slide={slide} />
          <Body>{slide.body}</Body>
          {slide.points.length > 0 && (
            <ul className="flex flex-col gap-2.5">
              {slide.points.map((p, i) => (
                <li key={i} className="flex gap-3 text-base leading-relaxed sm:text-lg">
                  <span className="mt-2.5 size-2 shrink-0 rounded-full bg-brand" aria-hidden />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case "picture": {
      const c = caseOf(slide.caseId);
      return (
        <Split
          text={
            <>
              <Heading slide={slide} />
              <Body>{slide.body}</Body>
              {c && <CaseChip lessonCase={c} />}
            </>
          }
          picture={c && <LessonPicture lessonCase={c} stepId={slide.stepId} layoutId={layoutId} />}
        />
      );
    }

    case "walk": {
      const c = caseOf(slide.caseId);
      const last = slide.frames.length - 1;
      const at = Math.min(state.frame, last);
      const frame = slide.frames[at];
      return (
        <Split
          text={
            <>
              <Heading slide={slide} />
              {slide.body && <Body className="sm:text-base">{slide.body}</Body>}
              <div className="flex flex-col gap-3 rounded-xl border border-brand/40 bg-brand-soft/60 p-4">
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Previous moment"
                    disabled={at === 0}
                    onClick={() => controls.setFrame(at - 1)}
                  >
                    <ChevronLeftIcon />
                  </Button>
                  <Button variant="brand" size="icon-sm" aria-label={state.playing ? "Pause" : "Play"} onClick={controls.togglePlay}>
                    {state.playing ? <PauseIcon /> : <PlayIcon />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Next moment"
                    disabled={at === last}
                    onClick={() => controls.setFrame(at + 1)}
                  >
                    <ChevronRightIcon />
                  </Button>
                  <ol className="ml-2 flex flex-1 flex-wrap items-center gap-1" aria-label="Moments">
                    {slide.frames.map((f, i) => (
                      <li key={f.stepId}>
                        <button
                          type="button"
                          aria-label={`Moment ${i + 1}`}
                          aria-current={i === at ? "step" : undefined}
                          onClick={() => controls.setFrame(i)}
                          className={cn(
                            "block h-1.5 rounded-full transition-all",
                            i === at ? "w-5 bg-brand-strong" : i < at ? "w-2.5 bg-brand" : "w-2.5 bg-muted-foreground/25",
                          )}
                        />
                      </li>
                    ))}
                  </ol>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {at + 1} / {slide.frames.length}
                  </span>
                </div>
                <div aria-live="polite" className="min-h-20">
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={frame.stepId} {...appear} className="text-base leading-relaxed">
                      {frame.caption}
                    </motion.p>
                  </AnimatePresence>
                </div>
              </div>
              {c && <CaseChip lessonCase={c} />}
            </>
          }
          picture={
            c && (
              <LessonPicture
                lessonCase={c}
                stepId={frame.stepId}
                prevStepId={at > 0 ? slide.frames[at - 1].stepId : undefined}
                layoutId={layoutId}
              />
            )
          }
        />
      );
    }

    case "predict": {
      const c = caseOf(slide.caseId);
      return (
        <Split
          text={
            <>
              <Heading slide={slide} />
              <div className="flex gap-3 rounded-xl border border-brand/40 bg-brand-soft/60 p-4">
                <MessageCircleQuestionIcon className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                <p className="text-base leading-relaxed sm:text-lg">{slide.question}</p>
              </div>
              <AnimatePresence mode="wait" initial={false}>
                {state.revealed ? (
                  <motion.div key="answer" {...appear} className="flex gap-3 rounded-xl border bg-tile p-4" aria-live="polite">
                    <LightbulbIcon className="mt-0.5 size-5 shrink-0 text-brand-strong" aria-hidden />
                    <p className="text-base leading-relaxed">{slide.answer}</p>
                  </motion.div>
                ) : (
                  <motion.div key="ask" {...appear} className="flex flex-col items-start gap-2">
                    <p className="text-sm text-muted-foreground">Make your guess first, then check it.</p>
                    <Button variant="brand" onClick={controls.reveal}>
                      Show what happens
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </>
          }
          picture={
            c && (
              <LessonPicture
                lessonCase={c}
                stepId={state.revealed ? slide.answerStepId : slide.stepId}
                prevStepId={state.revealed ? slide.stepId : undefined}
                layoutId={layoutId}
              />
            )
          }
        />
      );
    }

    case "pause":
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
            <HandIcon className="size-6" aria-hidden />
          </span>
          <div className="flex max-w-xl flex-col items-center gap-3">
            {slide.label && <p className="text-xs font-semibold tracking-wider text-brand-strong uppercase">{slide.label}</p>}
            <h2 className="text-2xl leading-tight font-semibold tracking-tight text-balance sm:text-3xl">{slide.title}</h2>
            <Body>{slide.body}</Body>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={problemHref} className={buttonVariants({ variant: "brand" })}>
              Try it now
            </Link>
            <Link href={`${problemHref}/sketch`} className={buttonVariants({ variant: "outline" })}>
              <PencilRulerIcon /> Draw it on the whiteboard
            </Link>
            <Button variant="ghost" onClick={controls.next}>
              Keep going <ArrowRightIcon />
            </Button>
          </div>
        </div>
      );

    case "cost":
      return (
        <div className="flex max-w-3xl flex-col gap-6">
          <Heading slide={slide} />
          <div className="grid gap-3 sm:grid-cols-2">
            <CostTile icon={<ClockIcon />} label="Time" value={slide.time} />
            <CostTile icon={<DatabaseIcon />} label="Extra space" value={slide.space} />
          </div>
          <Body>{slide.body}</Body>
        </div>
      );
  }
}

function CostTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-tile p-4">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-strong [&_svg]:size-5">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-mono text-2xl font-semibold break-words">{value || "—"}</p>
      </div>
    </div>
  );
}
