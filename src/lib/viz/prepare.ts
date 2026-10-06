import type { Highlight, Pointer, Step, StructureKind, StructureState, Tone, VizSpec } from "@/lib/ai/schemas/vizSpec";

const SEQUENCE_KINDS: ReadonlySet<StructureKind> = new Set(["array", "string", "stack", "queue"]);
type SequenceState = Extract<StructureState, { kind: "array" | "string" | "stack" | "queue" }>;

function itemsOf(state: SequenceState): string[] {
  const raw = state.kind === "array" || state.kind === "string" ? state.values : state.items;
  return raw.map((v) => JSON.stringify(v));
}

/**
 * Gives every array/string/stack/queue item a stable id across steps so motion can
 * animate swaps and shifts. Explicit `ids` win; otherwise each value is
 * matched to an unused id from the previous step holding the same value,
 * preferring the same index.
 */
export function withStableIds(spec: VizSpec): VizSpec {
  const sequenceIds = spec.structures.filter((s) => SEQUENCE_KINDS.has(s.kind)).map((s) => s.id);
  if (sequenceIds.length === 0) return spec;

  const prevByStructure = new Map<string, Prev>();
  let counter = 0;
  const fresh = (sid: string) => `${sid}#${counter++}`;

  const steps = spec.steps.map((step) => {
    const states = { ...step.states };
    for (const sid of sequenceIds) {
      const state = states[sid];
      if (!state || !SEQUENCE_KINDS.has(state.kind)) continue;
      const seq = state as SequenceState;
      const values = itemsOf(seq);
      let ids = seq.ids && seq.ids.length === values.length ? seq.ids : undefined;
      if (!ids) {
        const prev = prevByStructure.get(sid);
        const make = () => fresh(sid);
        ids = !prev
          ? values.map(make)
          : seq.kind === "queue"
            ? matchQueue(prev, values, make)
            : seq.kind === "stack"
              ? matchStack(prev, values, make)
              : matchIds(prev, values, make);
      }
      states[sid] = { ...seq, ids };
      prevByStructure.set(sid, { values, ids });
    }
    return { ...step, states };
  });
  return { ...spec, steps };
}

type Prev = { values: string[]; ids: string[] };

/** Queue: some items left the front, some joined the back. */
function matchQueue(prev: Prev, values: string[], fresh: () => string): string[] {
  for (let k = 0; k <= prev.values.length; k++) {
    const kept = prev.values.slice(k);
    if (kept.length <= values.length && kept.every((v, i) => values[i] === v)) {
      return [...prev.ids.slice(k), ...values.slice(kept.length).map(fresh)];
    }
  }
  return matchIds(prev, values, fresh);
}

/** Stack: the bottom stays put; everything above the common prefix is new. */
function matchStack(prev: Prev, values: string[], fresh: () => string): string[] {
  let p = 0;
  while (p < prev.values.length && p < values.length && prev.values[p] === values[p]) p++;
  return [...prev.ids.slice(0, p), ...values.slice(p).map(fresh)];
}

function matchIds(prev: Prev, values: string[], fresh: () => string): string[] {
  const used = new Set<number>();
  const result: (string | null)[] = values.map((v, i) => {
    if (i < prev.values.length && prev.values[i] === v) {
      used.add(i);
      return prev.ids[i];
    }
    return null;
  });
  return result.map((assigned, i) => {
    if (assigned) return assigned;
    const v = values[i];
    let best = -1;
    for (let j = 0; j < prev.values.length; j++) {
      if (used.has(j) || prev.values[j] !== v) continue;
      if (best === -1 || Math.abs(j - i) < Math.abs(best - i)) best = j;
    }
    if (best !== -1) {
      used.add(best);
      return prev.ids[best];
    }
    return fresh();
  });
}

export function bugStepIndexes(spec: VizSpec): Set<number> {
  const bugIds = new Set(spec.diagnosis.bugStepIds);
  const out = new Set<number>();
  spec.steps.forEach((s, i) => {
    if (s.isBugMoment || bugIds.has(s.id)) out.add(i);
  });
  return out;
}

/** Steps where a new loop iteration begins, for timeline tick marks. */
export function iterationStarts(spec: VizSpec): Map<number, { loopId: string; index: number }> {
  const out = new Map<number, { loopId: string; index: number }>();
  let prev: Step["iteration"] | undefined;
  spec.steps.forEach((s, i) => {
    const it = s.iteration;
    if (it && (!prev || prev.loopId !== it.loopId || prev.index !== it.index)) out.set(i, it);
    prev = it;
  });
  return out;
}

export type StepDecorations = {
  pointers: Pointer[];
  /** target (stringified) -> tone; later highlights win. */
  tones: Map<string, Tone>;
};

export function decorationsFor(step: Step, structureId: string): StepDecorations {
  const pointers = (step.pointers ?? []).filter((p) => p.structureId === structureId);
  const tones = new Map<string, Tone>();
  for (const h of step.highlights ?? ([] as Highlight[])) {
    if (h.structureId !== structureId) continue;
    for (const t of h.targets) tones.set(String(t), h.tone);
  }
  return { pointers, tones };
}

export function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) return `[${v.map(formatValue).join(", ")}]`;
  if (typeof v === "string") return v;
  return String(v);
}
