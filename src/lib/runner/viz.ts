import type { CaseSpec, Step } from "@/lib/ai/schemas/vizSpec";
import { collapseSteps } from "@/lib/trace/collapse";
import { autoSteps, type AutoEvent } from "@/lib/trace/steps";

/** What a Python line does, judged from its text (the JS instrumenter judges JS statements itself). */
function eventForLine(text: string): AutoEvent["event"] {
  const t = text.trim();
  if (/^return\b/.test(t)) return "return";
  if (/^(if|elif|while)\b/.test(t)) return "compare";
  if (/\.(append|appendleft|push|add)\(|heappush\(/.test(t)) return "push";
  if (/\.(pop|popleft)\(|heappop\(/.test(t)) return "pop";
  if (/^\w+(\[[^\]]+\])+\s*,\s*\w+(\[[^\]]+\])+\s*=/.test(t)) return "swap";
  if (/(^|[^=!<>])=(?!=)/.test(t)) return "update";
  return null;
}

/** "left 0 → 1, sum 12": what changed since the previous step, for the step's explanation. */
function changes(prev: Step | undefined, now: Step): string {
  const before = (prev?.states.vars as { vars?: Record<string, unknown> } | undefined)?.vars ?? {};
  const after = (now.states.vars as { vars?: Record<string, unknown> } | undefined)?.vars ?? {};
  const parts = Object.entries(after).flatMap(([k, v]) =>
    !(k in before) ? [`${k} = ${JSON.stringify(v)}`] : before[k] !== v ? [`${k} ${JSON.stringify(before[k])} → ${JSON.stringify(v)}`] : [],
  );
  return parts.length ? parts.join(", ").slice(0, 600) : "";
}

const NO_DIAGNOSIS: CaseSpec["diagnosis"] = { whatGoesWrong: "", whyItGoesWrong: "", bugStepIds: [], thinkingHints: [] };

/**
 * One case of a browser run as something the Player can show: the steps the run recorded, with the
 * structures and pointers worked out from the variables, long loops folded, and each step titled with its
 * line and explained by what changed. No model is involved.
 */
export function runCaseSpec(
  code: string,
  events: AutoEvent[],
  loops: { id: string; line: number }[],
  language: "python" | "javascript" | "typescript",
): CaseSpec | null {
  if (!events.length) return null;
  const codeLines = code.split("\n");
  const withEvents = language === "python" ? events.map((e) => ({ ...e, event: e.event ?? eventForLine(codeLines[e.line] ?? "") })) : events;
  const labelled = loops.map((l) => ({ ...l, label: (codeLines[l.line] ?? "").trim().slice(0, 40) || l.id }));
  const { structures, steps } = autoSteps(withEvents, { structures: [], pointers: [] }, labelled, codeLines.length);
  const explained = steps.map((s, i) => ({
    ...s,
    title: s.line !== null ? `Line ${s.line + 1}: ${(codeLines[s.line] ?? "").trim()}`.slice(0, 120) : s.title,
    explanation: changes(steps[i - 1], s),
  }));
  return { codeLines, diagnosis: NO_DIAGNOSIS, structures, loops: labelled, steps: collapseSteps(explained, labelled) };
}
