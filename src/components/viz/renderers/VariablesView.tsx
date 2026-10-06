"use client";

import { motion } from "motion/react";
import { cn } from "cn";
import { formatValue } from "@/lib/viz/prepare";
import { SPRING, TONE_BOX } from "../tones";
import type { RendererProps } from "./types";

export function VariablesView({ state, prevState, deco }: RendererProps<"variables">) {
  const entries = Object.entries(state.vars);
  if (entries.length === 0) return <p className="text-sm text-muted-foreground italic">no variables</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([name, value]) => {
        const shown = formatValue(value);
        const changed = prevState !== undefined && formatValue(prevState.vars[name]) !== shown;
        const tone = deco.tones.get(name) ?? (changed ? "active" : undefined);
        return (
          <div
            key={name}
            className={cn(
              "flex items-center overflow-hidden rounded-md border font-mono text-sm transition-colors duration-300",
              tone ? TONE_BOX[tone] : "border-border",
            )}
          >
            <span className="border-r bg-muted/50 px-2 py-0.5 text-muted-foreground">{name}</span>
            <motion.span
              key={shown}
              className="px-2 py-0.5"
              initial={changed ? { opacity: 0, y: -6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={SPRING}
            >
              {value === null ? <span className="text-muted-foreground">null</span> : shown}
            </motion.span>
          </div>
        );
      })}
    </div>
  );
}
