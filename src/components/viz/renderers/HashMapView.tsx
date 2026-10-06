"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

export function HashMapView({ state, prevState, deco }: RendererProps<"hashmap">) {
  const prev = new Map(prevState?.entries.map(([k, v]) => [String(k), formatValue(v)]));
  if (state.entries.length === 0) return <p className="text-sm text-muted-foreground italic">empty map</p>;

  return (
    <div className="inline-grid min-w-40 grid-cols-[auto_auto] overflow-hidden rounded-md border text-sm">
      <div className="border-b bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">key</div>
      <div className="border-b border-l bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground">value</div>
      <AnimatePresence initial={false}>
        {state.entries.map(([key, value]) => {
          const k = String(key);
          const tone = deco.tones.get(k);
          const shown = formatValue(value);
          const isNew = prevState !== undefined && !prev.has(k);
          const changed = prev.has(k) && prev.get(k) !== shown;
          return (
            <motion.div
              key={k}
              layout
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={SPRING}
              className="col-span-2 grid grid-cols-subgrid border-b last:border-b-0"
            >
              <div
                className={cn(
                  "px-3 py-1 font-mono transition-colors duration-300",
                  tone && TONE_BOX[tone],
                  isNew && !tone && "bg-viz-active/10",
                )}
              >
                {formatValue(key)}
              </div>
              <div
                className={cn(
                  "border-l px-3 py-1 font-mono transition-colors duration-300",
                  tone && TONE_BOX[tone],
                  isNew && !tone && "bg-viz-active/10",
                )}
              >
                <motion.span
                  key={shown}
                  className="inline-block"
                  initial={changed ? { scale: 1.4, opacity: 0.2 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING}
                >
                  {shown}
                </motion.span>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
