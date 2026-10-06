import type { Tone } from "@/lib/ai/schemas/vizSpec";

/** Box styles per highlight tone (cells, chips, rows). */
export const TONE_BOX: Record<Tone, string> = {
  active: "border-viz-active bg-viz-active/15 text-foreground",
  compare: "border-viz-compare bg-viz-compare/20 text-foreground",
  success: "border-viz-success bg-viz-success/15 text-foreground",
  error: "border-viz-error bg-viz-error/15 text-foreground ring-2 ring-viz-error/30",
  visited: "border-viz-visited/60 bg-viz-visited/10 text-muted-foreground",
};

export const NEUTRAL_BOX = "border-border bg-card";

/** SVG fill/stroke per tone, as CSS variables so dark mode follows. */
export const TONE_SVG: Record<Tone, { fill: string; stroke: string }> = {
  active: { fill: "color-mix(in oklch, var(--viz-active) 22%, var(--card))", stroke: "var(--viz-active)" },
  compare: { fill: "color-mix(in oklch, var(--viz-compare) 25%, var(--card))", stroke: "var(--viz-compare)" },
  success: { fill: "color-mix(in oklch, var(--viz-success) 22%, var(--card))", stroke: "var(--viz-success)" },
  error: { fill: "color-mix(in oklch, var(--viz-error) 22%, var(--card))", stroke: "var(--viz-error)" },
  visited: { fill: "color-mix(in oklch, var(--viz-visited) 14%, var(--card))", stroke: "var(--viz-visited)" },
};

export const NEUTRAL_SVG = { fill: "var(--card)", stroke: "var(--border)" };

export const SPRING = { type: "spring", stiffness: 420, damping: 34, mass: 0.8 } as const;
