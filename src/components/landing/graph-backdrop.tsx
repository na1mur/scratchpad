import type { CSSProperties } from "react";
import { cn } from "cn";

const TILE = 28;
const COLS = 90;
const ROWS = 60;

// Static class strings so Tailwind can see them. Light and dark are tuned separately because
// the same alpha reads much stronger on the dark sheet.
const FILLS = [
  "fill-brand/35 dark:fill-brand/14",
  "fill-brand/22 dark:fill-brand/9",
  "fill-pen-blue/14 dark:fill-pen-blue/14",
  "fill-pen-blue/9 dark:fill-pen-blue/9",
  "fill-lilac/22 dark:fill-lilac/14",
  "fill-pen-red/11 dark:fill-pen-red/12",
];
// Brand and blue are the most common, red the rarest.
const FILL_WEIGHTS = [3, 2, 3, 2, 2, 1];

const FADE = {
  down: "[mask-image:linear-gradient(to_bottom,black_55%,transparent)]",
  up: "[mask-image:linear-gradient(to_top,black_40%,transparent)]",
  none: "",
};

/** Small seeded PRNG so server and client render the same cells. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Cell = { col: number; row: number; fill: string; delay: number };

function makeCells(seed: number): Cell[] {
  const rand = rng(seed);
  const total = FILL_WEIGHTS.reduce((a, b) => a + b, 0);
  const pickFill = () => {
    let n = rand() * total;
    for (let i = 0; i < FILLS.length; i++) {
      n -= FILL_WEIGHTS[i];
      if (n < 0) return FILLS[i];
    }
    return FILLS[0];
  };

  const taken = new Set<number>();
  const cells: Cell[] = [];
  const add = (col: number, row: number, fill: string) => {
    const key = row * COLS + col;
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS || taken.has(key)) return;
    taken.add(key);
    cells.push({ col, row, fill, delay: Math.round(rand() * 1400) });
  };

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (rand() > 0.032) continue;
      const fill = pickFill();
      add(col, row, fill);
      // Sometimes keep colouring a neighbour, like a hand shading in a few squares.
      if (rand() < 0.35) add(col + 1, row, fill);
      if (rand() < 0.2) add(col, row + 1, fill);
    }
  }
  return cells;
}

/** Quadrille paper with a scattering of shaded squares. Decorative; the parent supplies position and size. */
export function GraphBackdrop({
  seed,
  fade,
  className,
  style,
}: {
  seed: number;
  fade: keyof typeof FADE;
  className?: string;
  style?: CSSProperties;
}) {
  const cells = makeCells(seed);
  return (
    <div aria-hidden style={style} className={cn("bg-graph overflow-hidden", FADE[fade], className)}>
      <svg className="absolute inset-0 h-full w-full">
        {cells.map((c) => (
          <rect
            key={`${c.col}-${c.row}`}
            x={c.col * TILE + 1}
            y={c.row * TILE + 1}
            width={TILE - 1}
            height={TILE - 1}
            // Not cn(): tailwind-merge mistakes the animation class fill-mode-backwards for an SVG
            // fill colour and drops the real fill. The fill mode is set inline for the same reason.
            className={`${c.fill} animate-in duration-700 fade-in motion-reduce:animate-none`}
            style={{ animationDelay: `${c.delay}ms`, animationFillMode: "backwards" }}
          />
        ))}
      </svg>
    </div>
  );
}
