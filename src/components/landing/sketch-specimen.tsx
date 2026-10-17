import { cn } from "cn";

const NUMS = [3, 8, 2, 7, 5];
const CELL = 40;
const GAP = 6;
const PITCH = CELL + GAP;

// What the sidebar offers, so the row says what can be dropped on the canvas.
const PALETTE = ["Array", "Stack", "Queue", "Hash map", "Linked list", "Tree", "Graph", "Pointer", "Note", "Freehand"];

function Pointer({ name, index }: { name: string; index: number }) {
  return (
    <div
      className="absolute top-0 left-0 flex flex-col items-center text-pen-blue"
      style={{ width: CELL, transform: `translateX(${index * PITCH}px)` }}
    >
      <span className="font-hand text-xl leading-5 font-semibold">{name}</span>
      <svg width="10" height="6" viewBox="0 0 10 6" aria-hidden>
        <path d="M0 0h10L5 6z" fill="currentColor" />
      </svg>
    </div>
  );
}

function ArrayDrawing({ lo, hi, dropped = [] }: { lo: number; hi: number; dropped?: number[] }) {
  return (
    <div className="w-fit" aria-hidden>
      <div className="relative h-9">
        <Pointer name="lo" index={lo} />
        <Pointer name="hi" index={hi} />
      </div>
      <ul className="flex" style={{ gap: GAP }}>
        {NUMS.map((value, i) => (
          <li
            key={i}
            className={cn(
              "relative grid place-items-center rounded-md border-[1.5px] border-ink/70 bg-paper font-mono text-base font-medium",
              dropped.includes(i) && "opacity-45",
            )}
            style={{ width: CELL, height: CELL }}
          >
            {value}
            {dropped.includes(i) && (
              <svg viewBox="0 0 40 40" fill="none" className="absolute inset-0 text-ink/70">
                <path d="M6 35C14 27 25 16 34 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A small, static picture of the sketch canvas: the same two-pointer approach drawn twice, one iteration under the other. */
export function SketchSpecimen() {
  return (
    <figure className="overflow-hidden rounded-sm border border-ink/20 bg-sheet">
      <ul className="flex flex-wrap gap-1.5 border-b border-ink/10 px-3 py-2.5 text-sm">
        {PALETTE.map((name) => (
          <li key={name} className="rounded-sm border border-ink/15 bg-paper px-2 py-0.5 text-ink/75">
            {name}
          </li>
        ))}
      </ul>

      <div className="bg-graph-subtle bg-paper px-5 py-6 sm:px-8">
        <p className="sr-only">
          A drawing of the array 3, 8, 2, 7, 5 with pointers lo and hi, drawn again below after lo moves right. A
          sticky note says target equals 9.
        </p>
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
          <ArrayDrawing lo={0} hi={4} />
          <p
            aria-hidden
            className="mt-2 rotate-2 bg-marker/80 px-3 py-2 font-hand text-2xl leading-6 font-semibold text-ink dark:bg-marker/30"
          >
            target = 9
          </p>
        </div>

        <div aria-hidden className="flex items-center gap-2 py-3 pl-2 font-hand text-2xl leading-6 font-semibold text-pen-blue">
          <svg width="28" height="34" viewBox="0 0 28 34" fill="none" className="shrink-0">
            <path
              d="M6 3C18 8 20 20 10 29M4 23l6 7 7-5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="-rotate-1">3 + 5 = 8, too small</span>
        </div>

        <ArrayDrawing lo={1} hi={4} dropped={[0]} />
      </div>

      <figcaption className="border-t border-ink/10 px-4 py-2.5 text-sm text-ink/70">
        Paste a copy and it lands below, so iterations read top to bottom.
      </figcaption>
    </figure>
  );
}
