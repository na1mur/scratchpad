"use client";

import { useRef } from "react";
import { cn } from "cn";

/** Two spaces keep indented code readable in the narrow left panel. */
const INDENT = "  ";

const LINE_HEIGHT = 24; // leading-6
// Vertical padding (py-2), the border, and room for a horizontal scrollbar so it never forces a vertical one.
const CHROME = 16 + 2 + 14;

/**
 * Textarea with a line-number gutter that scrolls in sync. Tab inserts spaces, Enter keeps the
 * current line's indentation (one level deeper after a colon), Backspace inside leading indentation removes a whole level, and Ctrl+Backspace on a line of only indentation clears it.
 * It grows with its content between `minLines` and `maxLines`, then scrolls.
 */
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
  minLines = 14,
  maxLines = 32,
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
  minLines?: number;
  maxLines?: number;
}) {
  const gutter = useRef<HTMLDivElement>(null);
  const lineCount = Math.max(1, value.split("\n").length);
  const visibleLines = Math.min(maxLines, Math.max(minLines, lineCount));

  /** Replaces `from..to` with `text` through the browser's editing command, so Ctrl+Z still undoes it. */
  function replaceRange(el: HTMLTextAreaElement, from: number, to: number, text: string) {
    el.setSelectionRange(from, to);
    if (document.execCommand(text ? "insertText" : "delete", false, text)) return;
    onChange(`${value.slice(0, from)}${text}${value.slice(to)}`);
    requestAnimationFrame(() => el.setSelectionRange(from + text.length, from + text.length));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly || e.nativeEvent.isComposing) return;
    const el = e.currentTarget;
    const { selectionStart: start, selectionEnd: end } = el;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    const beforeCursor = value.slice(lineStart, start);

    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      replaceRange(el, start, end, INDENT);
    } else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // A new line starts at the previous line's indentation, one level deeper after a colon.
      const opensBlock = beforeCursor.trimEnd().endsWith(":");
      const indent = /^[ \t]*/.exec(beforeCursor)![0] + (opensBlock ? INDENT : "");
      if (!indent) return;
      e.preventDefault();
      replaceRange(el, start, end, `\n${indent}`);
    } else if (e.key === "Backspace" && (e.ctrlKey || e.metaKey) && start === end && /^[ \t]+$/.test(beforeCursor)) {
      // On a line that's only indentation so far, drop all of it at once.
      e.preventDefault();
      replaceRange(el, lineStart, start, "");
    } else if (e.key === "Backspace" && !e.ctrlKey && !e.metaKey && !e.altKey && start === end && /^ +$/.test(beforeCursor)) {
      // Inside leading indentation one Backspace removes a whole level (back to the previous tab stop).
      e.preventDefault();
      const drop = beforeCursor.length % INDENT.length || INDENT.length;
      replaceRange(el, start - drop, start, "");
    }
  }

  return (
    <div
      style={{ height: visibleLines * LINE_HEIGHT + CHROME }}
      className={cn(
        "flex overflow-hidden rounded-lg border bg-tile font-mono text-[13px] leading-6 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50",
        invalid && "border-destructive ring-3 ring-destructive/20",
        readOnly && "bg-muted/50",
        className,
      )}
    >
      <div
        ref={gutter}
        aria-hidden
        className="w-10 shrink-0 overflow-hidden border-r bg-foreground/5 py-2 pr-2 text-right text-muted-foreground/70 select-none tabular-nums"
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
