import "server-only";
import {
  EVENTS,
  highlightSchema,
  pointerSchema,
  structureStateSchema,
  type Loop,
  type Step,
  type Structure,
  type StructureKind,
  type StructureState,
  type VizSpec,
} from "@/lib/ai/schemas/vizSpec";
import type { RawTraceEvent } from "./sandbox";

export { collapseSteps } from "@/lib/trace/collapse";

function emptyState(kind: StructureKind): StructureState {
  switch (kind) {
    case "array":
    case "string":
      return { kind, values: [] };
    case "hashmap":
      return { kind, entries: [] };
    case "set":
      return { kind, values: [] };
    case "stack":
    case "queue":
      return { kind, items: [] };
    case "linkedList":
      return { kind, nodes: [], headId: null };
    case "tree":
      return { kind, nodes: [], rootId: null };
    case "graph":
      return { kind, nodes: [], edges: [], directed: false };
    case "matrix":
      return { kind, rows: [] };
    case "variables":
      return { kind, vars: {} };
  }
}

export type EventProblems = { badStates: number; unknownStructures: Set<string> };

/**
 * Turns raw trace() calls into schema-valid step skeletons (no titles yet).
 * States a call omits are carried forward from the previous step, so every
 * step holds a full snapshot of every structure.
 */
export function eventsToSteps(
  events: RawTraceEvent[],
  structures: Structure[],
  loops: Loop[],
  lineCount: number,
): { steps: Step[]; problems: EventProblems } {
  const kinds = new Map(structures.map((s) => [s.id, s.kind]));
  const loopIds = new Set(loops.map((l) => l.id));
  const current = new Map<string, StructureState>(structures.map((s) => [s.id, emptyState(s.kind)]));
  const problems: EventProblems = { badStates: 0, unknownStructures: new Set() };

  const steps = events.map((ev, i): Step => {
    const rawStates = ev.states && typeof ev.states === "object" ? (ev.states as Record<string, unknown>) : {};
    for (const [sid, raw] of Object.entries(rawStates)) {
      const kind = kinds.get(sid);
      if (!kind) {
        problems.unknownStructures.add(sid);
        continue;
      }
      const parsed = structureStateSchema.safeParse(raw);
      if (parsed.success && parsed.data.kind === kind) current.set(sid, parsed.data);
      else problems.badStates++;
    }

    const line = typeof ev.line === "number" && Number.isInteger(ev.line) && ev.line >= 0 && ev.line < lineCount ? ev.line : null;
    const loop = ev.loop as { id?: unknown; index?: unknown } | null | undefined;
    const iteration =
      loop && typeof loop.id === "string" && loopIds.has(loop.id) && typeof loop.index === "number" && loop.index >= 0
        ? { loopId: loop.id, index: Math.floor(loop.index) }
        : undefined;
    const event = (EVENTS as readonly string[]).includes(ev.event as string) ? (ev.event as Step["event"]) : undefined;
    const pointers = (Array.isArray(ev.pointers) ? ev.pointers : [])
      .map((p) => pointerSchema.safeParse(p))
      .filter((p) => p.success && kinds.has(p.data.structureId))
      .map((p) => p.data!);
    const highlights = (Array.isArray(ev.highlights) ? ev.highlights : [])
      .map((h) => highlightSchema.safeParse(h))
      .filter((h) => h.success && kinds.has(h.data.structureId))
      .map((h) => h.data!);

    return {
      id: `s${i + 1}`,
      line,
      ...(iteration && { iteration }),
      title: line !== null ? `Line ${line + 1}` : "Step",
      explanation: "",
      states: Object.fromEntries(current),
      ...(pointers.length && { pointers }),
      ...(highlights.length && { highlights }),
      ...(event && { event }),
    };
  });

  return { steps, problems };
}

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
