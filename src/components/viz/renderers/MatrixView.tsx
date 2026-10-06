"use client";

import { motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

/** Cells are addressed as "row,col" by pointers and highlights. */
export function MatrixView({ state, prevState, deco }: RendererProps<"matrix">) {
  const cols = Math.max(0, ...state.rows.map((r) => r.length));
  const pointerAt = new Map<string, string[]>();
  for (const p of deco.pointers) {
    const key = String(p.index).replace(/\s/g, "");
    pointerAt.set(key, [...(pointerAt.get(key) ?? []), p.name]);
  }
  if (state.rows.length === 0) return <p className="text-sm text-muted-foreground italic">empty matrix</p>;

  return (
    <div
      className="inline-grid gap-1"
      style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(2.25rem, auto))` }}
    >
      <span />
      {Array.from({ length: cols }, (_, c) => (
        <span key={c} className="text-center font-mono text-[10px] text-muted-foreground">
          {c}
        </span>
      ))}
      {state.rows.map((row, r) => (
        <div key={r} className="contents">
          <span className="self-center pr-1 font-mono text-[10px] text-muted-foreground">{r}</span>
          {Array.from({ length: cols }, (_, c) => {
            const key = `${r},${c}`;
            const value = row[c];
            const tone = deco.tones.get(key);
            const changed = prevState !== undefined && prevState.rows[r]?.[c] !== value;
            const names = pointerAt.get(key);
            return (
              <div
                key={c}
                className={cn(
                  "relative flex h-9 items-center justify-center rounded border px-1 font-mono text-sm transition-colors duration-300",
                  tone ? TONE_BOX[tone] : NEUTRAL_BOX,
                  value === undefined && "border-dashed opacity-40",
                )}
              >
                <motion.span
                  key={formatValue(value)}
                  initial={changed ? { scale: 1.4, opacity: 0.2 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING}
                >
                  {value === undefined ? "" : formatValue(value)}
                </motion.span>
                {names && (
                  <span className="absolute -top-2 right-0 rounded bg-viz-pointer px-1 text-[9px] leading-3.5 font-semibold text-white">
                    {names.join(",")}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
