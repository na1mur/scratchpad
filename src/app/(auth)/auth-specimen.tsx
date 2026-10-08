import { cn } from "cn";

type Cell = {
  value: string | number;
  /** Already passed over; struck through. */
  dim?: boolean;
  /** Part of what the algorithm is looking at right now. */
  hot?: boolean;
  /** Pointer name shown under the cell. */
  mark?: string;
  /** The step the red pen goes round. */
  circled?: boolean;
};
type Row = { label?: string; cells: Cell[] };
type Specimen = { call: string; rows: Row[]; note: string };

// Each auth page gets a different trace, frozen at the step where it goes wrong. The notes ask a question
// or point at the step; none of them states the fix, like the hints in the product.
const SPECIMENS: Record<"twoPointers" | "binarySearch" | "brackets" | "window", Specimen> = {
  twoPointers: {
    call: "pairWithSum([3, 8, 2, 7, 5], 9)",
    rows: [
      {
        cells: [
          { value: 3, dim: true },
          { value: 8, hot: true, mark: "lo" },
          { value: 2, hot: true, mark: "hi" },
          { value: 7, dim: true, circled: true },
          { value: 5, dim: true },
        ],
      },
    ],
    note: "2 + 7 = 9, and this step dropped the 7.",
  },
  binarySearch: {
    call: "binarySearch([1, 3, 5, 7, 9, 11], 11)",
    rows: [
      {
        cells: [
          { value: 1, dim: true },
          { value: 3, dim: true },
          { value: 5, dim: true },
          { value: 7, dim: true },
          { value: 9, hot: true, mark: "lo/mid", circled: true },
          { value: 11, hot: true, mark: "hi" },
        ],
      },
    ],
    note: "mid is 9 again and lo hasn't moved. Why?",
  },
  brackets: {
    call: 'isBalanced("([)]")',
    rows: [
      {
        label: "input",
        cells: [
          { value: "(", dim: true },
          { value: "[", dim: true },
          { value: ")", hot: true, mark: "i", circled: true },
          { value: "]" },
        ],
      },
      {
        label: "stack",
        cells: [{ value: "(" }, { value: "[", hot: true, mark: "top" }],
      },
    ],
    note: "The ) arrived, but the top of the stack is [. What now?",
  },
  window: {
    call: 'longestUnique("abcab")',
    rows: [
      {
        cells: [
          { value: "a", hot: true, mark: "l" },
          { value: "b", hot: true },
          { value: "c", hot: true },
          { value: "a", hot: true, mark: "r", circled: true },
          { value: "b" },
        ],
      },
    ],
    note: "a repeats inside the window. Which end should move?",
  },
};

export type SpecimenName = keyof typeof SPECIMENS;

/** Decorative: a trace with the red pen circling the step that breaks. The circle draws itself once. */
export function AuthSpecimen({ name }: { name: SpecimenName }) {
  const { call, rows, note } = SPECIMENS[name];
  return (
    <figure className="relative w-full max-w-[31rem] rounded-xl border border-ink/15 bg-sheet p-6 shadow-xl shadow-ink/5 xl:p-8">
      <figcaption className="font-mono text-sm text-ink/60">{call}</figcaption>
      {rows.map((row, r) => (
        <div key={r} className={r === 0 ? "mt-8" : "mt-5"}>
          {row.label && <p className="mb-2 font-mono text-sm text-ink/60">{row.label}</p>}
          <ul className="flex gap-2 xl:gap-3">
            {row.cells.map((c, i) => (
              <li key={i} className="flex flex-col items-center gap-1.5">
                <div className="relative">
                  <div
                    className={cn(
                      "flex size-12 items-center justify-center rounded-md border border-ink/25 font-mono text-xl xl:size-14",
                      c.dim && "text-ink/40 line-through",
                      c.hot && "border-brand-strong bg-brand-soft",
                    )}
                  >
                    {c.value}
                  </div>
                  {c.circled && (
                    <svg viewBox="0 0 64 64" className="pointer-events-none absolute -inset-[20%] size-[140%]">
                      <path
                        pathLength={1}
                        d="M34 6 C50 5 60 18 58 33 C56 49 42 59 28 57 C12 55 3 42 6 28 C9 14 22 6 38 8 C44 9 48 11 51 14"
                        className="pen-draw fill-none stroke-pen-red"
                        style={{ "--pen-delay": "0.9s" } as React.CSSProperties}
                        strokeWidth={2.5}
                        strokeLinecap="round"
                      />
                    </svg>
                  )}
                </div>
                <span className="h-4 font-mono text-sm whitespace-nowrap text-ink/70">{c.mark}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <p className="mt-6 font-hand text-3xl leading-8 text-pen-red">{note}</p>
    </figure>
  );
}
