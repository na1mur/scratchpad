"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

/** Top of the stack is drawn at the top. */
export function StackView({ state, deco }: RendererProps<"stack">) {
  const n = state.items.length;
  const order = state.items.map((item, i) => ({ item, i })).reverse();
  return (
    <div className="flex w-fit min-w-32 flex-col gap-1">
      <span className="text-[10px] tracking-wide text-muted-foreground uppercase">top</span>
      <div className="flex min-h-10 flex-col gap-1 rounded-md border-x-2 border-b-2 border-muted-foreground/30 p-1.5">
        <AnimatePresence initial={false} mode="popLayout">
          {order.map(({ item, i }) => {
            const tone = deco.tones.get(String(i));
            const pointer = deco.pointers.find((p) => String(p.index) === String(i));
            return (
              <motion.div
                key={state.ids?.[i] ?? `idx-${i}`}
                layout
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -16, transition: { duration: 0.15 } }}
                transition={SPRING}
                className={cn(
                  "flex items-center justify-between gap-3 rounded border px-3 py-1 font-mono text-sm",
                  tone ? TONE_BOX[tone] : NEUTRAL_BOX,
                  i === n - 1 && !tone && "border-foreground/30",
                )}
              >
                <span>{formatValue(item)}</span>
                {pointer && <span className="text-[10px] font-semibold text-viz-pointer">{pointer.name}</span>}
              </motion.div>
            );
          })}
        </AnimatePresence>
        {n === 0 && <span className="py-1 text-center text-xs text-muted-foreground italic">empty</span>}
      </div>
    </div>
  );
}
