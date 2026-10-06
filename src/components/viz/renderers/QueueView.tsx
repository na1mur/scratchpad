"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

/** Front of the queue on the left; items enter on the right. */
export function QueueView({ state, deco }: RendererProps<"queue">) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">front</span>
      <div className="flex min-h-11 min-w-24 items-center gap-1.5 rounded-md border-y-2 border-muted-foreground/30 px-1.5 py-1">
        <AnimatePresence initial={false} mode="popLayout">
          {state.items.map((item, i) => {
            const tone = deco.tones.get(String(i));
            return (
              <motion.div
                key={state.ids?.[i] ?? `idx-${i}`}
                layout
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16, transition: { duration: 0.15 } }}
                transition={SPRING}
                className={cn(
                  "flex h-8 min-w-8 items-center justify-center rounded border px-2 font-mono text-sm",
                  tone ? TONE_BOX[tone] : NEUTRAL_BOX,
                )}
              >
                {formatValue(item)}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {state.items.length === 0 && <span className="px-2 text-xs text-muted-foreground italic">empty</span>}
      </div>
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">back</span>
    </div>
  );
}
