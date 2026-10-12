import {
  EVENTS,
  structureStateSchema,
  type DisplayValue,
  type Highlight,
  type Loop,
  type Pointer,
  type Scalar,
  type Step,
  type Structure,
  type StructureKind,
  type StructureState,
} from "@/lib/ai/schemas/vizSpec";

/**
 * Turns the snapshots an automatically traced run recorded (runtime.ts) into VizSpec steps: which
 * variables become which structures, the pointers into them, and highlights for what just changed.
 * Safe to import on the client.
 */

export type Snap =
  | number
  | string
  | boolean
  | null
  | { t: "arr"; v: Snap[]; n: number }
  | { t: "map"; e: [Scalar, Snap][] }
  | { t: "set"; v: Scalar[] }
  | { t: "list"; head: string; nodes: { id: string; v: Scalar; next: string | null }[] }
  | { t: "tree"; root: string; nodes: { id: string; v: Scalar; l?: string | null; r?: string | null; c?: string[] }[] }
  | { t: "obj"; e: [string, Snap][] }
  | { t: "ref" };

export type AutoEvent = {
  auto: true;
  line: number;
  loop: string | null;
  iter: number | null;
  event: string | null;
  vars: Record<string, Snap>;
  calls: string[];
};

/** What the model said is worth showing: variables by name. Structure ids are the variable names. */
export type ShowDecl = {
  structures: { id: string; label: string; kind: StructureKind }[];
  pointers: { variable: string; structureId: string }[];
};

export function isAutoEvent(e: unknown): e is AutoEvent {
  return Boolean(e && typeof e === "object" && (e as AutoEvent).auto === true);
}

const MAX_STRUCTURES = 6;
const VARS = "vars";
const CALLS = "calls";
const INDEX_NAMES = /^(i|j|k|l|r|lo|hi|low|high|mid|left|right|start|end|begin|slow|fast|p|q|p1|p2|ptr|idx|index|\w+(Idx|Index|Ptr))$/;

type Obj = Exclude<Snap, number | string | boolean | null>;
const isObj = (s: Snap | undefined): s is Obj => Boolean(s && typeof s === "object");
const isScalarSnap = (s: Snap | undefined) => s === null || (s !== undefined && typeof s !== "object");

function scalarOf(s: Snap): Scalar {
  if (s === null || typeof s === "number" || typeof s === "string") return s;
  if (typeof s === "boolean") return String(s);
  return shortText(s);
}

function primitiveOf(s: Snap): string | number | boolean | null {
  return isObj(s) ? shortText(s) : s;
}

function displayOf(s: Snap): DisplayValue {
  if (isObj(s) && s.t === "arr" && s.v.every((x) => !isObj(x))) return s.v.map(primitiveOf);
  return primitiveOf(s);
}

/** Compact text for a nested value shown inside a cell. */
function shortText(s: Snap): string {
  const plain = (x: Snap): unknown => {
    if (!isObj(x)) return x;
    switch (x.t) {
      case "arr":
        return x.v.map(plain);
      case "set":
        return x.v;
      case "map":
      case "obj":
        return Object.fromEntries(x.e.map(([k, v]) => [String(k), plain(v)]));
      case "list":
        return x.nodes.map((n) => n.v);
      case "tree":
        return `tree(${x.nodes[0]?.v ?? ""})`;
      case "ref":
        return "…";
    }
  };
  const text = JSON.stringify(plain(s)) ?? "";
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

/** The structure kind a value suggests, for variables the model didn't declare. */
function inferKind(name: string, s: Snap): StructureKind | null {
  if (!isObj(s)) return null;
  switch (s.t) {
    case "arr":
      if (/stack|stk/i.test(name)) return "stack";
      if (/queue|^q$|deque/i.test(name)) return "queue";
      return s.v.length && s.v.every((r) => isObj(r) && r.t === "arr") ? "matrix" : "array";
    case "map":
    case "obj":
      return "hashmap";
    case "set":
      return "set";
    case "list":
      return "linkedList";
    case "tree":
      return "tree";
    case "ref":
      return null;
  }
}

function graphOf(s: Obj): StructureState | null {
  const entries = s.t === "map" || s.t === "obj" ? s.e : s.t === "arr" ? s.v.map((v, i) => [i, v] as [Scalar, Snap]) : null;
  if (!entries) return null;
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (x: unknown) => {
    const id = String(x);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
    return id;
  };
  const edges: { from: string; to: string; weight?: number }[] = [];
  for (const [k, v] of entries) {
    const from = add(k);
    if (!isObj(v) || (v.t !== "arr" && v.t !== "set")) continue;
    for (const nb of v.v) {
      if (isObj(nb) && nb.t === "arr") {
        const to = add(nb.v[0]);
        edges.push({ from, to, ...(typeof nb.v[1] === "number" && { weight: nb.v[1] }) });
      } else edges.push({ from, to: add(nb) });
    }
  }
  const key = (a: string, b: string) => `${a}>${b}`;
  const set = new Set(edges.map((e) => key(e.from, e.to)));
  const directed = edges.some((e) => !set.has(key(e.to, e.from)));
  const kept = directed ? edges : edges.filter((e) => e.from <= e.to);
  return { kind: "graph", nodes: ids.map((id) => ({ id, label: id })), edges: kept, directed };
}

/** A variable's snapshot as a structure of the given kind, or null when it doesn't fit. */
function stateOf(kind: StructureKind, s: Snap): StructureState | null {
  let raw: unknown = null;
  if (kind === "string" && typeof s === "string") raw = { kind, values: [...s] };
  else if (isObj(s)) {
    switch (kind) {
      case "array":
      case "string":
        if (s.t === "arr") raw = { kind, values: s.v.map(scalarOf) };
        break;
      case "matrix":
        if (s.t === "arr") raw = { kind, rows: s.v.map((r) => (isObj(r) && r.t === "arr" ? r.v.map(scalarOf) : [scalarOf(r)])) };
        break;
      case "stack":
      case "queue":
        if (s.t === "arr") raw = { kind, items: s.v.map(displayOf) };
        break;
      case "set":
        if (s.t === "set" || s.t === "arr") raw = { kind, values: s.v.map((x) => primitiveOf(x as Snap)) };
        break;
      case "hashmap":
        if (s.t === "map" || s.t === "obj") {
          raw = { kind, entries: s.e.map(([k, v]) => [typeof k === "number" ? k : String(k), displayOf(v)]) };
        }
        break;
      case "linkedList":
        if (s.t === "list") raw = { kind, nodes: s.nodes.map((n) => ({ id: n.id, value: n.v, next: n.next })), headId: s.head };
        break;
      case "tree":
        if (s.t === "tree") {
          raw = {
            kind,
            rootId: s.root,
            nodes: s.nodes.map((n) => ({ id: n.id, value: n.v, ...(n.c ? { children: n.c } : { left: n.l ?? null, right: n.r ?? null }) })),
          };
        }
        break;
      case "graph":
        raw = graphOf(s);
        break;
    }
  } else if (s === null && (kind === "linkedList" || kind === "tree")) {
    raw = kind === "tree" ? { kind, nodes: [], rootId: null } : { kind, nodes: [], headId: null };
  }
  if (!raw) return null;
  const parsed = structureStateSchema.safeParse(raw);
  return parsed.success && parsed.data.kind === kind ? parsed.data : null;
}

function emptyState(kind: StructureKind): StructureState {
  return structureStateSchema.parse(
    {
      array: { kind, values: [] },
      string: { kind, values: [] },
      matrix: { kind, rows: [] },
      stack: { kind, items: [] },
      queue: { kind, items: [] },
      set: { kind, values: [] },
      hashmap: { kind, entries: [] },
      linkedList: { kind, nodes: [], headId: null },
      tree: { kind, nodes: [], rootId: null },
      graph: { kind, nodes: [], edges: [], directed: false },
      variables: { kind, vars: {} },
    }[kind],
  );
}

/** Cells that changed since the previous step, so the eye lands on them. */
function changed(prev: StructureState | undefined, now: StructureState): (number | string)[] {
  if (!prev || prev.kind !== now.kind) return [];
  if ((now.kind === "array" || now.kind === "string") && (prev.kind === "array" || prev.kind === "string")) {
    if (prev.values.length !== now.values.length) return [];
    return now.values.flatMap((v, i) => (v !== prev.values[i] ? [i] : []));
  }
  if (now.kind === "matrix" && prev.kind === "matrix") {
    return now.rows.flatMap((row, r) => row.flatMap((v, c) => (prev.rows[r] && v !== prev.rows[r][c] ? [`${r},${c}`] : [])));
  }
  if (now.kind === "hashmap" && prev.kind === "hashmap") {
    const before = new Map(prev.entries.map(([k, v]) => [String(k), JSON.stringify(v)]));
    return now.entries.flatMap(([k, v]) => (before.get(String(k)) !== JSON.stringify(v) ? [k] : []));
  }
  return [];
}

function lengthOf(st: StructureState): number | null {
  if (st.kind === "array" || st.kind === "string") return st.values.length;
  if (st.kind === "stack" || st.kind === "queue") return st.items.length;
  return null;
}

function nodeIds(st: StructureState): Set<string> | null {
  if (st.kind === "linkedList" || st.kind === "tree") return new Set(st.nodes.map((n) => n.id));
  return null;
}

/**
 * Builds the structures and steps of one automatically traced run. Declared structures come first;
 * container variables the model didn't declare are added after them (up to six), declarations that
 * match no variable are dropped. Scalars go in "vars", and a call stack shows when calls nest.
 */
export function autoSteps(
  events: AutoEvent[],
  decl: ShowDecl,
  loops: Loop[],
  lineCount: number,
): { structures: Structure[]; steps: Step[] } {
  const present = new Map<string, Snap>();
  for (const e of events) for (const [k, v] of Object.entries(e.vars)) if (!present.has(k)) present.set(k, v);

  const structures: Structure[] = [];
  const ids = new Set<string>([VARS, CALLS]);
  for (const s of decl.structures) {
    if (s.kind === "variables" || ids.has(s.id) || !present.has(s.id)) continue;
    // A declared kind the value can't take (a "tree" that's an array) falls back to what it looks like.
    const kind = events.some((e) => e.vars[s.id] !== undefined && stateOf(s.kind, e.vars[s.id])) ? s.kind : inferKind(s.id, present.get(s.id)!);
    if (!kind) continue;
    structures.push({ id: s.id, label: (s.label || s.id).slice(0, 40), kind });
    ids.add(s.id);
  }
  const pointerVars = new Set(decl.pointers.map((p) => p.variable));
  // Node variables (cur, slow, fast…) point into a list or tree already shown rather than becoming another one.
  const nodePointers: string[] = [];
  for (const [name, snap] of present) {
    if (ids.has(name) || pointerVars.has(name)) continue;
    const kind = inferKind(name, snap);
    if (!kind) continue;
    if ((kind === "linkedList" || kind === "tree") && structures.some((s) => s.kind === kind)) {
      nodePointers.push(name);
      continue;
    }
    if (structures.length >= MAX_STRUCTURES) continue;
    structures.push({ id: name, label: name.slice(0, 40), kind });
    ids.add(name);
  }
  const shown = new Set(structures.map((s) => s.id));
  const nested = events.some((e) => e.calls.length > 1);
  if (nested) structures.push({ id: CALLS, label: "Call stack", kind: "stack" });
  structures.push({ id: VARS, label: "Variables", kind: "variables" });

  const kinds = new Map(structures.map((s) => [s.id, s.kind]));
  const declaredPointers = decl.pointers.filter((p) => shown.has(p.structureId));
  const firstSequence = structures.find((s) => s.kind === "array" || s.kind === "string");
  // Without declared pointers, integer variables with index-like names point into the first array.
  const pointers = declaredPointers.length
    ? declaredPointers
    : firstSequence
      ? [...present.keys()].filter((n) => INDEX_NAMES.test(n) && !shown.has(n)).map((variable) => ({ variable, structureId: firstSequence.id }))
      : [];

  const loopIds = new Set(loops.map((l) => l.id));
  const current = new Map<string, StructureState>(structures.map((s) => [s.id, emptyState(s.kind)]));

  const steps = events.map((e, i): Step => {
    const before = new Map(current);
    for (const s of structures) {
      if (s.id === VARS || s.id === CALLS) continue;
      const snap = e.vars[s.id];
      if (snap === undefined) continue;
      const st = stateOf(s.kind, snap);
      if (st) current.set(s.id, st);
    }
    const vars: Record<string, string | number | boolean | null> = {};
    for (const [k, v] of Object.entries(e.vars)) if (!shown.has(k) && isScalarSnap(v)) vars[k] = v as string | number | boolean | null;
    current.set(VARS, { kind: "variables", vars });
    if (nested) current.set(CALLS, { kind: "stack", items: e.calls.map((c) => c.slice(0, 40)) });

    const stepPointers: Pointer[] = [];
    for (const variable of nodePointers) {
      const v = e.vars[variable];
      if (!isObj(v) || (v.t !== "list" && v.t !== "tree")) continue;
      const id = v.t === "list" ? v.head : v.root;
      const into = structures.find((s) => nodeIds(current.get(s.id)!)?.has(id));
      if (into) stepPointers.push({ structureId: into.id, name: variable.slice(0, 24), index: id });
    }
    for (const p of pointers) {
      const v = e.vars[p.variable];
      const st = current.get(p.structureId)!;
      const len = lengthOf(st);
      if (typeof v === "number" && Number.isInteger(v) && len !== null && v >= 0 && v <= len) {
        stepPointers.push({ structureId: p.structureId, name: p.variable.slice(0, 24), index: v });
      } else if (isObj(v) && (v.t === "list" || v.t === "tree")) {
        const id = v.t === "list" ? v.head : v.root;
        if (nodeIds(st)?.has(id)) stepPointers.push({ structureId: p.structureId, name: p.variable.slice(0, 24), index: id });
      }
    }

    const highlights: Highlight[] = [];
    for (const s of structures) {
      const targets = changed(before.get(s.id), current.get(s.id)!);
      if (targets.length && i > 0) highlights.push({ structureId: s.id, targets, tone: "active" });
    }
    if (e.event === "compare") {
      const bySeq = new Map<string, number[]>();
      for (const p of stepPointers) {
        if (typeof p.index !== "number" || !["array", "string"].includes(kinds.get(p.structureId) ?? "")) continue;
        bySeq.set(p.structureId, [...(bySeq.get(p.structureId) ?? []), p.index]);
      }
      for (const [structureId, targets] of bySeq) highlights.push({ structureId, targets, tone: "compare" });
    }

    const line = Number.isInteger(e.line) && e.line >= 0 && e.line < lineCount ? e.line : null;
    const event = (EVENTS as readonly string[]).includes(e.event ?? "") ? (e.event as Step["event"]) : i === 0 ? "init" : undefined;
    return {
      id: `s${i + 1}`,
      line,
      ...(e.loop && loopIds.has(e.loop) && e.iter !== null && e.iter >= 0 && { iteration: { loopId: e.loop, index: e.iter } }),
      title: line !== null ? `Line ${line + 1}` : "Step",
      explanation: "",
      states: Object.fromEntries(current),
      ...(stepPointers.length && { pointers: stepPointers }),
      ...(highlights.length && { highlights }),
      ...(event && { event }),
    };
  });
  return { structures, steps };
}
