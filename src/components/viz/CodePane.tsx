"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";

/** Read-only code with the executing line highlighted and kept in view. */
export function CodePane({
  lines,
  addedLines,
  activeLine,
  isBug,
  className,
}: {
  lines: string[];
  /** Lines the pipeline added to make the learner's fragment runnable. */
  addedLines?: number[];
  activeLine: number | null;
  /** The current step is where the logic goes wrong. */
  isBug?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const added = new Set(addedLines);

  useEffect(() => {
    const box = container.current;
    const el = activeLine === null ? null : box?.querySelector<HTMLElement>(`[data-line="${activeLine}"]`);
    if (!box || !el) return;
    // Scroll only this pane; scrollIntoView would also scroll the page.
    const top = el.offsetTop;
    const bottom = top + el.offsetHeight;
    if (top < box.scrollTop) box.scrollTo({ top: top - 8, behavior: "smooth" });
    else if (bottom > box.scrollTop + box.clientHeight) {
      box.scrollTo({ top: bottom - box.clientHeight + 8, behavior: "smooth" });
    }
  }, [activeLine]);

  return (
    <div
      ref={container}
      className={cn("relative overflow-auto rounded-lg border bg-muted/30 py-2 font-mono text-[13px] leading-6", className)}
    >
      {lines.map((line, i) => {
        const active = i === activeLine;
        const isAdded = added.has(i);
        return (
          <div
            key={i}
            data-line={i}
            aria-current={active ? "step" : undefined}
            title={isAdded ? "Added to make your code runnable" : undefined}
            className={cn(
              "flex border-l-2 border-transparent pr-3 transition-colors duration-200",
              active && "border-viz-active bg-viz-active/15",
              active && isBug && "border-viz-error bg-viz-error/15",
            )}
          >
            <span className="w-9 shrink-0 pr-3 text-right text-muted-foreground/70 select-none tabular-nums">
              {i + 1}
            </span>
            <span className="w-3 shrink-0 text-viz-success select-none" aria-hidden>
              {isAdded ? "+" : ""}
            </span>
            <span className={cn("whitespace-pre", isAdded && !active && "text-muted-foreground italic")}>
              {line || " "}
              {isAdded && <span className="sr-only"> (added to make your code runnable)</span>}
            </span>
          </div>
        );
      })}
      {added.size > 0 && (
        <p className="mt-1 border-t px-3 pt-2 font-sans text-xs text-muted-foreground">
          <span className="font-mono text-viz-success">+</span> Lines added to make your code runnable. Your logic is
          unchanged.
        </p>
      )}
    </div>
  );
}
