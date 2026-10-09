"use client";

import { useEffect, useRef } from "react";
import { cn } from "cn";
import type { ThemedToken } from "shiki/core";
import { useHighlightedLines } from "@/hooks/use-highlighted-lines";

/** One line of code: syntax-colored when it has tokens, plain text otherwise. */
export function CodeLine({ line, tokens }: { line: string; tokens?: ThemedToken[] }) {
  if (!tokens?.length) return line || " ";
  return tokens.map((t, j) => (
    // Each token carries both themes' colors as CSS variables; the class picks the one for the current theme.
    <span key={j} style={t.htmlStyle as React.CSSProperties} className="text-(--shiki-light) dark:text-(--shiki-dark)">
      {t.content}
    </span>
  ));
}

/** Read-only code with the executing line highlighted and kept in view. */
export function CodePane({
  lines,
  language,
  addedLines,
  activeLine,
  isBug,
  className,
}: {
  lines: string[];
  /** A `LanguageId`; syntax colors are skipped for pseudo-code or when it's missing. */
  language?: string | null;
  /** Lines the pipeline added to make the learner's fragment runnable. */
  addedLines?: number[];
  activeLine: number | null;
  /** The current step is where the logic goes wrong. */
  isBug?: boolean;
  className?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const added = new Set(addedLines);
  const tokens = useHighlightedLines(lines, language);

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
      className={cn("relative overflow-auto rounded-lg border bg-tile py-2 font-mono text-[13px] leading-6", className)}
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
              {/* Added lines stay muted so they read as scaffolding, not the learner's code. */}
              <CodeLine line={line} tokens={isAdded ? undefined : tokens?.[i]} />
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
