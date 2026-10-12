/**
 * A problem's harness: how to call a solution to it (function name, typed parameters, return type), the
 * fixed test cases every attempt runs on, and how to compare an answer with the expected one. Built once
 * per problem (src/lib/harness/build.ts). Values travel as LeetCode-style JSON: a linked list is an array of
 * its values, a binary tree a level-order array with null for gaps. Safe to import on the client.
 */

/** A parameter or return type. LeetCode's names ("integer[]", "list<string>", "TreeNode") parse into these. */
export type ValueType =
  | { kind: "int" }
  | { kind: "double" }
  | { kind: "bool" }
  | { kind: "string" }
  | { kind: "char" }
  | { kind: "list" }
  | { kind: "tree" }
  | { kind: "void" }
  | { kind: "array"; of: ValueType }
  /**
   * Never parsed from a name: a node of the cycle list, as {"node": index} (null: no node), so a plain number
   * can't pass for a node. The model states it as the bare index; nodeAnswer() wraps that. See answerType().
   */
  | { kind: "nodeIndex" };

const PRIMITIVES: Record<string, ValueType> = {
  integer: { kind: "int" },
  int: { kind: "int" },
  long: { kind: "int" },
  double: { kind: "double" },
  float: { kind: "double" },
  boolean: { kind: "bool" },
  bool: { kind: "bool" },
  string: { kind: "string" },
  str: { kind: "string" },
  character: { kind: "char" },
  char: { kind: "char" },
  listnode: { kind: "list" },
  treenode: { kind: "tree" },
  void: { kind: "void" },
};

/** Parses a type name; null for one the harness can't handle (graph `Node`, design-problem classes…). */
export function parseType(name: string): ValueType | null {
  const s = name.trim();
  if (s.endsWith("[]")) {
    const of = parseType(s.slice(0, -2));
    return of && of.kind !== "void" ? { kind: "array", of } : null;
  }
  const generic = /^list\s*<(.+)>$/i.exec(s);
  if (generic) {
    const of = parseType(generic[1]);
    return of && of.kind !== "void" ? { kind: "array", of } : null;
  }
  return PRIMITIVES[s.toLowerCase()] ?? null;
}

/** Why `value` isn't a valid JSON value of type `t`, or null when it is. */
export function checkValue(t: ValueType, value: unknown, path = "value"): string | null {
  switch (t.kind) {
    case "int":
      return Number.isInteger(value) ? null : `${path} must be an integer`;
    case "double":
      return typeof value === "number" && Number.isFinite(value) ? null : `${path} must be a number`;
    case "bool":
      return typeof value === "boolean" ? null : `${path} must be true or false`;
    case "string":
      return typeof value === "string" ? null : `${path} must be a string`;
    case "char":
      return typeof value === "string" && [...value].length === 1 ? null : `${path} must be a one-character string`;
    case "list":
      return Array.isArray(value) && value.every((v) => typeof v === "number" || typeof v === "string")
        ? null
        : `${path} must be an array of the list's values`;
    case "tree":
      return Array.isArray(value) && value.every((v) => v === null || typeof v === "number" || typeof v === "string")
        ? null
        : `${path} must be a level-order array with null for missing children`;
    case "void":
      return null;
    case "nodeIndex":
      return value === null || Number.isInteger(value) ? null : `${path} must be the node's index in the list, or null`;
    case "array":
      if (!Array.isArray(value)) return `${path} must be an array`;
      for (let i = 0; i < value.length; i++) {
        const issue = checkValue(t.of, value[i], `${path}[${i}]`);
        if (issue) return issue;
      }
      return null;
  }
}

/**
 * How an answer is checked against the expected one. `unordered`: the top-level array may come in any order;
 * `unordered_nested`: the inner arrays too (e.g. groups of anagrams); `float`: numbers within 1e-5;
 * `any_valid`: several answers are correct, so code can't decide and the model judges.
 */
export const COMPARE_MODES = ["exact", "unordered", "unordered_nested", "float", "any_valid"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export type HarnessParam = { name: string; type: string };
export type HarnessCycle = { param: string; pos: string };
/** One fixed test case. Arguments and the expected answer are JSON text, exactly as stored. */
export type HarnessCase = { label: string; argsJson: string; expectedJson: string };

export type ReadyHarness = {
  status: "ready";
  /** `leetcode`: the signature came from LeetCode's own metadata; `generated`: the model wrote it. */
  origin: "leetcode" | "generated";
  functionName: string;
  params: HarnessParam[];
  returnType: string;
  /** For a `void` function that changes an argument in place, that argument's name: it holds the answer. */
  outputParam?: string;
  /**
   * Linked-list cycle problems (LeetCode's `pos`): the list parameter's tail links back to the node at the
   * index in each case's `pos` argument (-1: no cycle). `pos` isn't passed to the function, and a node
   * answer is given as its index in that list.
   */
  cycle?: HarnessCycle;
  compare: CompareMode;
  cases: HarnessCase[];
  /** The JS solution the expected answers were computed with. Hidden from the learner. */
  referenceJs: string;
  builtAt: Date;
};

export type Harness =
  | ReadyHarness
  | { status: "building"; startedAt: Date }
  /** The problem doesn't fit a function call on JSON values (a design problem, a graph of `Node`s…). */
  /** `version`: the HARNESS_VERSION that judged it; a later version supporting more gets to try again. */
  | { status: "unsupported"; reason: string; builtAt: Date; version?: number }
  | { status: "failed"; reason: string; builtAt: Date };

export function isReady(h: unknown): h is ReadyHarness {
  return Boolean(h && typeof h === "object" && (h as Harness).status === "ready");
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? sortKeys(v) : v));
}

function sortKeys(o: Record<string, unknown>) {
  return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
}

function closeEnough(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(b));
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => closeEnough(x, b[i]));
  return canonical(a) === canonical(b);
}

function sortedByJson(values: unknown[]): unknown[] {
  return values.map((v) => [canonical(v), v] as const).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}

/** Whether `actual` answers the case; null when the mode can't tell (`any_valid`). */
export function sameAnswer(mode: CompareMode, actual: unknown, expected: unknown): boolean | null {
  switch (mode) {
    case "any_valid":
      return null;
    case "float":
      return closeEnough(actual, expected);
    case "unordered":
      if (!Array.isArray(actual) || !Array.isArray(expected)) return canonical(actual) === canonical(expected);
      return canonical(sortedByJson(actual)) === canonical(sortedByJson(expected));
    case "unordered_nested": {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return canonical(actual) === canonical(expected);
      const inner = (xs: unknown[]) => xs.map((x) => (Array.isArray(x) ? sortedByJson(x) : x));
      return canonical(sortedByJson(inner(actual))) === canonical(sortedByJson(inner(expected)));
    }
    case "exact":
      return canonical(actual) === canonical(expected);
  }
}

/** "nums = [2,7,11,15], target = 9"; a cycle list adds where its tail links: "head = [3,2,0,-4] (tail → index 1)". */
export function describeArgs(params: HarnessParam[], argsJson: string, cycle?: HarnessCycle): string {
  try {
    const args = JSON.parse(argsJson) as Record<string, unknown>;
    return params
      .map((p) => {
        const value = `${p.name} = ${JSON.stringify(args[p.name])}`;
        if (cycle?.param !== p.name) return value;
        const pos = args[cycle.pos];
        return typeof pos === "number" && pos >= 0 ? `${value} (tail → index ${pos})` : `${value} (no cycle)`;
      })
      .join(", ");
  } catch {
    return argsJson;
  }
}

/**
 * The type of the answer as compared: the argument a void function changes, a node of the cycle list
 * (as its index), or the return value.
 */
export function answerType(h: Pick<ReadyHarness, "params" | "returnType" | "outputParam" | "cycle">): ValueType | null {
  if (h.outputParam) return parseType(h.params.find((p) => p.name === h.outputParam)?.type ?? "");
  const ret = parseType(h.returnType);
  return h.cycle && ret?.kind === "list" ? { kind: "nodeIndex" } : ret;
}

/**
 * The signature as the models read it, with what an in-place answer or a cycle means. `forProgram` adds how
 * a translated program builds the cycle list.
 */
export function signatureText(
  h: Pick<ReadyHarness, "functionName" | "params" | "returnType" | "outputParam" | "cycle">,
  forProgram = false,
): string {
  const params = h.params.map((p) => `${p.name}: ${p.type}`).join(", ");
  let text = `${h.functionName}(${params}) -> ${h.returnType}`;
  if (h.outputParam) text += ` (changes ${h.outputParam} in place; that's the answer)`;
  if (h.cycle) {
    const { param, pos } = h.cycle;
    text += `\n${param}'s tail links back to the node at index ${pos}, which each test case gives (-1: no cycle); ${pos} isn't a parameter.`;
    if (parseType(h.returnType)?.kind === "list") text += ` The answer is a node of that list (or null).`;
    if (forProgram) text += ` Build the list with toList(input.${param}, input.${pos}) so the cycle is linked.`;
  }
  return text;
}

/** An answer as the learner reads it: a node of a cycle list is "node at index 1", otherwise the JSON itself. */
export function answerText(
  h: Pick<ReadyHarness, "params" | "returnType" | "outputParam" | "cycle">,
  json: string,
): string {
  if (answerType(h)?.kind !== "nodeIndex") return json;
  try {
    const at = JSON.parse(json);
    if (at === null) return "null (no node)";
    if (at && typeof at === "object" && "node" in at) return at.node === null ? "a node not in the list" : `node at index ${at.node}`;
    return json;
  } catch {
    return json;
  }
}

/** A node answer as the model states it (the bare index) in the form runs produce ({"node": index}). */
export function nodeAnswer(value: unknown): unknown {
  return Number.isInteger(value) ? { node: value } : value;
}

/**
 * How to call a solution and read its answer: a harness with its types parsed. Used alike by the server
 * sandbox (reference runs) and the browser runner.
 */
export type CallSpec = {
  functionName: string;
  params: { name: string; type: ValueType }[];
  /** The type of what's compared (answerType()). */
  answerType: ValueType;
  /** Index of the parameter a void function changes: its value afterwards is the answer. */
  outputIndex?: number;
  cycle?: HarnessCycle;
};

export function callSpec(h: Pick<ReadyHarness, "functionName" | "params" | "returnType" | "outputParam" | "cycle">): CallSpec | null {
  const params = h.params.map((p) => ({ name: p.name, type: parseType(p.type) }));
  const answer = answerType(h);
  if (!answer || params.some((p) => !p.type)) return null;
  const outputIndex = h.outputParam ? h.params.findIndex((p) => p.name === h.outputParam) : -1;
  return {
    functionName: h.functionName,
    params: params as CallSpec["params"],
    answerType: answer,
    ...(outputIndex >= 0 && { outputIndex }),
    ...(h.cycle && { cycle: h.cycle }),
  };
}

/** What the workspace shows of a ready harness: never the reference solution. `argsJson` is for running them. */
export type PublicTestCase = { label: string; input: string; expected: string; argsJson: string };

export function publicCases(h: ReadyHarness): PublicTestCase[] {
  return h.cases.map((c) => ({
    label: c.label,
    input: describeArgs(h.params, c.argsJson, h.cycle),
    expected: c.expectedJson,
    argsJson: c.argsJson,
  }));
}

/** The harness as the learner's pages see it. */
export type HarnessView =
  | ({ status: "ready"; cases: PublicTestCase[] } & Pick<
      ReadyHarness,
      "compare" | "functionName" | "params" | "returnType" | "outputParam" | "cycle"
    >)
  | { status: "building" | "unsupported" | "failed" | "none" };

export function harnessView(h: unknown): HarnessView {
  if (isReady(h)) {
    return {
      status: "ready",
      cases: publicCases(h),
      compare: h.compare,
      functionName: h.functionName,
      params: h.params,
      returnType: h.returnType,
      ...(h.outputParam && { outputParam: h.outputParam }),
      ...(h.cycle && { cycle: h.cycle }),
    };
  }
  const status = (h as Harness | null | undefined)?.status;
  return { status: status === "building" || status === "unsupported" || status === "failed" ? status : "none" };
}
