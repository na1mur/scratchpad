import { ArrowRightIcon } from "lucide-react";

const NOTES = [
  "two pointers, start at both ends",
  "sum too big → move hi left",
  "sum too small → move lo right",
  "stop when they meet",
];

/** A notebook page next to its transcription: same words, mistakes untouched. */
export function NotebookTranscript() {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[1fr_auto_1fr]">
      <figure
        className="relative -rotate-1 border border-ink/15 bg-sheet bg-ruled py-[6px] pr-4 pl-14"
        aria-label="A handwritten page of notes"
      >
        <span aria-hidden className="absolute inset-y-0 left-10 w-px bg-pen-red/60" />
        <p className="sr-only">{NOTES.join(". ")}</p>
        <div aria-hidden className="font-hand text-[1.7rem] leading-8 text-pen-blue">
          {NOTES.map((n) => (
            <p key={n}>{n}</p>
          ))}
          <p className="invisible">.</p>
        </div>
      </figure>

      <ArrowRightIcon aria-hidden className="mx-auto size-6 rotate-90 text-ink/50 md:rotate-0" />

      <figure className="border border-ink/20 bg-sheet">
        <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-8 text-ink">
          {NOTES.map((n) => n.replace("→", "->")).join("\n")}
        </pre>
        <figcaption className="border-t border-ink/10 px-4 py-2.5 text-sm text-ink/70">
          Transcribed as written. Review and edit it before anything runs.
        </figcaption>
      </figure>
    </div>
  );
}
