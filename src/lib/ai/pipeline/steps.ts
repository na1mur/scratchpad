import "server-only";
import {
  EVENTS,
  MAX_STEPS,
  highlightSchema,
  pointerSchema,
  structureStateSchema,
  type Loop,
  type Step,
  type Structure,
  type StructureKind,
  type StructureState,
} from "@/lib/ai/schemas/vizSpec";
import type { RawTraceEvent } from "./sandbox";

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

/**
 * Caps a run at MAX_STEPS. Iterations of the busiest loop in the middle of
 * the run are folded into one step each run of them ("…iterations 3–6
 * omitted"); if that's not enough, steps are thinned evenly.
 */
export function collapseSteps(steps: Step[], loops: Loop[]): Step[] {
  if (steps.length <= MAX_STEPS) return renumber(steps);

  const counts = new Map<string, Set<number>>();
  for (const s of steps) {
    if (!s.iteration) continue;
    const set = counts.get(s.iteration.loopId) ?? new Set<number>();
    set.add(s.iteration.index);
    counts.set(s.iteration.loopId, set);
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1].size - a[1].size)[0];
  let result = steps;

  if (busiest && busiest[1].size > 4) {
    const [loopId, indexSet] = busiest;
    const indexes = [...indexSet].sort((a, b) => a - b);
    const keep = new Set([...indexes.slice(0, 2), ...indexes.slice(-2)]);
    const label = loops.find((l) => l.id === loopId)?.label ?? loopId;
    result = [];
    let pending: Step[] = [];
    const flush = () => {
      if (!pending.length) return;
      const first = pending[0].iteration!.index;
      const last = pending[pending.length - 1].iteration!.index;
      const tail = pending[pending.length - 1];
      result.push({
        ...tail,
        title: `…iterations ${first + 1}–${last + 1} omitted`,
        explanation: `Iterations ${first + 1}–${last + 1} of ${label} follow the same pattern; this shows the state after them.`,
        isBugMoment: undefined,
      });
      pending = [];
    };
    for (const s of steps) {
      if (s.iteration?.loopId === loopId && !keep.has(s.iteration.index)) pending.push(s);
      else {
        flush();
        result.push(s);
      }
    }
    flush();
  }

  if (result.length > MAX_STEPS) {
    const stride = result.length / MAX_STEPS;
    const thinned: Step[] = [];
    for (let i = 0; i < MAX_STEPS - 1; i++) thinned.push(result[Math.floor(i * stride)]);
    thinned.push(result[result.length - 1]);
    result = thinned;
  }
  return renumber(result);
}

function renumber(steps: Step[]): Step[] {
  return steps.map((s, i) => ({ ...s, id: `s${i + 1}` }));
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
