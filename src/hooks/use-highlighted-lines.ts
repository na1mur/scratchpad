"use client";

import { useEffect, useState } from "react";
import type { HighlighterCore, LanguageInput, ThemedToken } from "shiki/core";

/** Grammars load on demand, so a page only fetches the one it shows. Pseudo-code has none and stays plain. */
const GRAMMARS: Record<string, LanguageInput> = {
  python: () => import("shiki/langs/python.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  typescript: () => import("shiki/langs/typescript.mjs"),
  java: () => import("shiki/langs/java.mjs"),
  cpp: () => import("shiki/langs/cpp.mjs"),
  csharp: () => import("shiki/langs/csharp.mjs"),
  go: () => import("shiki/langs/go.mjs"),
};

let highlighter: Promise<HighlighterCore> | null = null;

function getHighlighter() {
  highlighter ??= Promise.all([import("shiki/core"), import("shiki/engine/javascript")]).then(
    ([{ createHighlighterCore }, { createJavaScriptRegexEngine }]) =>
      createHighlighterCore({
        themes: [import("shiki/themes/github-light.mjs"), import("shiki/themes/github-dark.mjs")],
        langs: [],
        // The JS engine avoids shipping Oniguruma's WASM; forgiving skips the odd regex it can't translate.
        engine: createJavaScriptRegexEngine({ forgiving: true }),
      }),
  );
  return highlighter;
}

async function tokenize(code: string, language: string): Promise<ThemedToken[][]> {
  const hl = await getHighlighter();
  if (!hl.getLoadedLanguages().includes(language)) {
    await hl.loadLanguage(GRAMMARS[language]);
  }
  // No default color: each token carries --shiki-light/--shiki-dark and the renderer picks one per theme.
  return hl.codeToTokens(code, {
    lang: language,
    themes: { light: "github-light", dark: "github-dark" },
    defaultColor: false,
  }).tokens;
}

/**
 * Syntax-highlighted tokens for each line, or null while the grammar loads,
 * for pseudo-code, or if highlighting fails (callers then show plain text).
 */
export function useHighlightedLines(lines: string[], language: string | null | undefined): ThemedToken[][] | null {
  const code = lines.join("\n");
  const key = language && GRAMMARS[language] ? `${language}\n${code}` : null;
  const [result, setResult] = useState<{ key: string; tokens: ThemedToken[][] } | null>(null);

  useEffect(() => {
    if (!key || !language) return;
    let cancelled = false;
    tokenize(code, language).then(
      (tokens) => !cancelled && setResult({ key, tokens }),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [key, code, language]);

  return result && result.key === key ? result.tokens : null;
}
