"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

export function SetView({ state, deco }: RendererProps<"set">) {
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1.5">
      <span className="font-mono text-muted-foreground">{"{"}</span>
      <AnimatePresence initial={false} mode="popLayout">
        {state.values.map((v) => {
          const key = formatValue(v);
          const tone = deco.tones.get(key);
          return (
            <motion.span
              key={key}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={SPRING}
              className={cn("rounded-full border px-2.5 py-0.5 font-mono text-sm", tone ? TONE_BOX[tone] : NEUTRAL_BOX)}
            >
              {key}
            </motion.span>
          );
        })}
      </AnimatePresence>
      <span className="font-mono text-muted-foreground">{"}"}</span>
    </div>
  );
}
