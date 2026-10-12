"use client";

import { useEffect, useRef } from "react";
import { indentWithTab } from "@codemirror/commands";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { HighlightStyle, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { EditorView, basicSetup } from "codemirror";
import type { RunLanguage } from "@/lib/runner/protocol";

/** Token colours come from classes styled in globals.css (`.cm-tok-*`), so they follow the light/dark theme. */
const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], class: "cm-tok-keyword" },
  { tag: [t.string, t.special(t.string)], class: "cm-tok-string" },
  { tag: [t.number, t.bool, t.null], class: "cm-tok-literal" },
  { tag: [t.comment, t.lineComment, t.blockComment], class: "cm-tok-comment" },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))], class: "cm-tok-function" },
  { tag: [t.className, t.typeName, t.definition(t.className)], class: "cm-tok-type" },
]);

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent", color: "var(--foreground)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-mono, ui-monospace, monospace)", lineHeight: "1.6" },
  ".cm-gutters": { backgroundColor: "var(--tile)", color: "var(--muted-foreground)", border: "none" },
  ".cm-activeLine": { backgroundColor: "color-mix(in oklab, var(--brand) 10%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "color-mix(in oklab, var(--brand) 18%, transparent)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--foreground)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in oklab, var(--brand) 30%, transparent) !important",
  },
  ".cm-tooltip": { backgroundColor: "var(--popover)", color: "var(--popover-foreground)", border: "1px solid var(--border)" },
});

/**
 * CodeMirror 6 for Edit & Run. Uncontrolled inside: `value` replaces the document only when it differs
 * from what's there (e.g. a reset), so typing never fights a re-render. Ctrl/Cmd+Enter runs.
 */
export function CodeMirrorEditor({
  value,
  onChange,
  language,
  onRun,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  language: RunLanguage;
  onRun?: () => void;
  label: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef({ value, onChange, onRun });

  useEffect(() => {
    latest.current = { value, onChange, onRun };
  });

  useEffect(() => {
    const editor = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: latest.current.value,
        extensions: [
          basicSetup,
          keymap.of([
            { key: "Mod-Enter", run: () => (latest.current.onRun?.(), true) },
            indentWithTab,
          ]),
          language === "python" ? python() : javascript({ typescript: language === "typescript" }),
          indentUnit.of(language === "python" ? "    " : "  "),
          syntaxHighlighting(highlight),
          theme,
          EditorView.contentAttributes.of({ "aria-label": label }),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) latest.current.onChange(u.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [language, label]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== value) {
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
    }
  }, [value]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
