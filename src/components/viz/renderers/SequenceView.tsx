"use client";

import { AnimatePresence, motion } from "motion/react";
import { cn } from "cn";
import type { Pointer, Scalar } from "@/lib/ai/schemas/vizSpec";
import { formatValue, type StepDecorations } from "@/lib/viz/prepare";
import { NEUTRAL_BOX, SPRING, TONE_BOX } from "../tones";

/** Shared body for ArrayView and StringView: cells keyed by stable ids. */
export function SequenceView({
  values,
  ids,
  prevById,
  deco,
  variant,
}: {
  values: Scalar[];
  ids: string[];
  prevById: Map<string, Scalar>;
  deco: StepDecorations;
  variant: "array" | "string";
}) {
  const pointersAt = new Map<number, Pointer[]>();
  for (const p of deco.pointers) {
    const i = typeof p.index === "number" ? p.index : Number(p.index);
    if (!Number.isInteger(i)) continue;
    pointersAt.set(i, [...(pointersAt.get(i) ?? []), p]);
  }
  // Pointers past the end (e.g. left == n) still need a slot to sit in.
  const maxPointer = Math.max(-1, ...pointersAt.keys());
  const ghostSlots = Math.max(0, maxPointer - values.length + 1);

  if (values.length === 0 && ghostSlots === 0) {
    return <p className="text-sm text-muted-foreground italic">empty</p>;
  }

  return (
    <div className="flex items-end gap-1.5 pt-1">
      <AnimatePresence initial={false} mode="popLayout">
        {values.map((value, i) => {
          const id = ids[i] ?? `idx-${i}`;
          const tone = deco.tones.get(String(i));
          const prev = prevById.get(id);
          const changed = prevById.has(id) && prev !== value;
          return (
            <motion.div
              key={id}
              layout
              initial={{ opacity: 0, y: -12, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.8 }}
              transition={SPRING}
              className="flex flex-col items-center gap-1"
            >
              <PointerLabels pointers={pointersAt.get(i)} />
              <div
                className={cn(
                  "relative flex size-11 items-center justify-center rounded-md border font-mono text-sm font-medium transition-colors duration-300",
                  tone ? TONE_BOX[tone] : NEUTRAL_BOX,
                  variant === "string" && "size-9",
                )}
              >
                <motion.span
                  key={`${id}:${formatValue(value)}`}
                  initial={changed ? { scale: 1.5, opacity: 0.2 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={SPRING}
                >
                  {value === null ? <span className="text-muted-foreground">∅</span> : formatValue(value)}
                </motion.span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{i}</span>
            </motion.div>
          );
        })}
        {Array.from({ length: ghostSlots }, (_, g) => {
          const i = values.length + g;
          return (
            <motion.div key={`ghost-${i}`} layout className="flex flex-col items-center gap-1">
              <PointerLabels pointers={pointersAt.get(i)} />
              <div className="flex size-11 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                end
              </div>
              <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{i}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

export function PointerLabels({ pointers }: { pointers?: Pointer[] }) {
  return (
    <div className="flex min-h-5 flex-col items-center justify-end">
      {pointers?.map((p) => (
        <motion.span
          key={p.name}
          layoutId={`ptr-${p.structureId}-${p.name}`}
          transition={SPRING}
          className="rounded bg-viz-pointer px-1.5 font-mono text-[10px] leading-4 font-semibold text-white"
        >
          {p.name}
        </motion.span>
      ))}
      {pointers?.length ? <span className="text-[10px] leading-none text-viz-pointer">▼</span> : null}
    </div>
  );
}
