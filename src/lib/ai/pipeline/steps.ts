import "server-only";
import type { Step, VizSpec } from "@/lib/ai/schemas/vizSpec";

export { collapseSteps } from "@/lib/trace/collapse";

/** Compact, model-readable digest of the run: only what changed per step. */
export function describeSteps(steps: Step[], codeLines: string[], maxChars = 24_000): string {
  let prev: Record<string, string> = {};
  const lines: string[] = [];
  for (const s of steps) {
    const changed: string[] = [];
    const now: Record<string, string> = {};
    for (const [sid, st] of Object.entries(s.states)) {
      const json = JSON.stringify(st, (k, v) => (k === "ids" || k === "kind" ? undefined : v));
      now[sid] = json;
      if (prev[sid] !== json) changed.push(`${sid}=${json.length > 220 ? `${json.slice(0, 217)}...` : json}`);
    }
    prev = now;
    const code = s.line !== null ? ` \`${(codeLines[s.line] ?? "").trim()}\`` : "";
    const iter = s.iteration ? ` [${s.iteration.loopId} #${s.iteration.index + 1}]` : "";
    const ptr = s.pointers?.length ? ` pointers: ${s.pointers.map((p) => `${p.name}@${p.index}`).join(", ")}` : "";
    lines.push(
      `${s.id} line ${s.line === null ? "-" : s.line + 1}${code}${iter}${s.event ? ` (${s.event})` : ""}${ptr}${
        changed.length ? `\n   changed: ${changed.join("; ")}` : ""
      }${s.title && !s.title.startsWith("Line ") && s.title !== "Step" ? `\n   title: ${s.title}` : ""}`,
    );
  }
  const text = lines.join("\n");
  return text.length > maxChars ? `${text.slice(0, maxChars)}\n…(truncated)` : text;
}

/**
 * For chat prompts: every test case's result, and the trace of the one the learner is looking at.
 * `gives` names the result ("their code gives", "returns").
 */
export function casesContext(spec: VizSpec, viewingCaseId: string | undefined, gives: string): string {
  const viewing = Math.max(
    0,
    spec.cases.findIndex((c) => c.id === viewingCaseId),
  );
  const c = spec.cases[viewing];
  return [
    `<test_cases>`,
    ...spec.cases.map(
      (tc, i) =>
        `case ${i + 1} "${tc.label}": input ${tc.input}; expected ${tc.expectedOutput}; ${gives} ${tc.actualOutput}${
          tc.passed === undefined ? "" : tc.passed ? " (correct)" : " (wrong)"
        }${i === viewing ? "  <- the learner is looking at this case" : ""}`,
    ),
    `</test_cases>`,
    `<trace case="${viewing + 1}" note="step id ${c.id}-s4 is step 4 of this case; step numbers count within a case">`,
    describeSteps(c.steps, spec.codeLines, 12_000),
    `</trace>`,
  ].join("\n");
}

/** For chat prompts: the steps the learner selected to ask about, which may come from any case. */
export function focusedStepsBlock(spec: VizSpec, ids: string[]): string {
  const many = spec.cases.length > 1;
  const blocks = spec.cases.flatMap((c, ci) =>
    c.steps.flatMap((s, i) => {
      if (!ids.includes(s.id)) return [];
      const states = JSON.stringify(s.states, (k, v) => (k === "ids" ? undefined : v));
      const where = many ? `step ${i + 1} of case ${ci + 1}` : `step ${i + 1}`;
      return [`${where} (${s.id}), line ${s.line === null ? "-" : s.line + 1}: ${s.title}\n${s.explanation}\nstate: ${states.slice(0, 1500)}`];
    }),
  );
  return blocks.length ? `\n\n<focused_steps>\n${blocks.join("\n\n")}\n</focused_steps>` : "";
}
