"use client";

import { useRef } from "react";
import { cn } from "cn";

/** Two spaces keep indented code readable in the narrow left panel. */
const INDENT = "  ";

/** Textarea with a line-number gutter that scrolls in sync. Tab inserts spaces. */
export function CodeEditor({
  id,
  value,
  onChange,
  onBlur,
  readOnly,
  placeholder,
  invalid,
  maxLength,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  readOnly?: boolean;
  placeholder?: string;
  invalid?: boolean;
  maxLength?: number;
  className?: string;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, value.split("\n").length);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Tab" || readOnly || e.shiftKey) return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const next = `${value.slice(0, start)}${INDENT}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(start + INDENT.length, start + INDENT.length));
  }

  return (
    <div
      className={cn(
        "flex overflow-hidden rounded-lg border bg-muted/20 font-mono text-[13px] leading-6 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid && "border-destructive ring-3 ring-destructive/20",
        readOnly && "bg-muted/40",
        className,
      )}
    >
      <div
        ref={gutter}
        aria-hidden
        className="w-10 shrink-0 overflow-hidden border-r bg-muted/40 py-2 pr-2 text-right text-muted-foreground/70 select-none tabular-nums"
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={invalid}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onScroll={(e) => {
          if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop;
        }}
        style={{ tabSize: INDENT.length }}
        className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 outline-none placeholder:text-muted-foreground/60"
      />
    </div>
  );
}
