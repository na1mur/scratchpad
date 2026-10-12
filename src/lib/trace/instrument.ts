import { parse, type Comment, type Node } from "acorn";

/**
 * Automatic tracing for plain JavaScript. Parses the program and inserts, before every statement that
 * maps to a line of the learner's code, a call that records that line and a snapshot of every variable
 * in scope (`__step`), plus loop-iteration counters (`__iter`) and call-stack bookkeeping (`__enter`,
 * `__exit`). The calls are defined by AUTO_TRACE_RUNTIME (runtime.ts). Nobody writes trace() calls by
 * hand, so a program can't get them wrong; what's shown is decided from the snapshots afterwards
 * (steps.ts). Safe to import on the client.
 */

export type Instrumented = {
  program: string;
  /** Every loop that maps to a line, by the id its steps carry. */
  loops: { id: string; line: number }[];
};

export type InstrumentOptions = {
  /**
   * The line of the learner's code a statement starting on `sourceLine` (1-based) belongs to, or null
   * for a statement that only makes the program run (it gets no step).
   */
  lineFor: (sourceLine: number) => number | null;
  /** Functions left out of the call stack (the run(input) adapter). */
  hiddenFunctions?: string[];
};

/** `//@3` or `/*@3*\/` at the end of a line: the statement starting on it implements line 3 (0-based). */
export function markerLines(comments: Comment[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const c of comments) {
    const m = /^\s*@(\d+)\s*$/.exec(c.value);
    if (m && c.loc) map.set(c.loc.start.line, Number(m[1]));
  }
  return map;
}

/** Parses with line info, collecting comments. Throws acorn's SyntaxError ("Unexpected token (3:4)"). */
export function parseProgram(source: string): { ast: Node; comments: Comment[] } {
  const comments: Comment[] = [];
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", locations: true, onComment: comments });
  return { ast, comments };
}

type AnyNode = Node & Record<string, unknown>;
type Scope = { names: Set<string> };
type Ctx = { scopes: Scope[]; loopId: string | null; inFunction: boolean };

const STATEMENT_LISTS = new Set(["Program", "BlockStatement", "StaticBlock"]);
const LOOPS = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const SKIPPED_STATEMENTS = new Set(["FunctionDeclaration", "ClassDeclaration", "EmptyStatement"]);
/** Recorded once they've run, so the step shows their effect; anything else (a condition, a return) before. */
const AFTER_STATEMENTS = new Set(["VariableDeclaration", "ExpressionStatement"]);
const HIDDEN_NAMES = new Set(["arguments", "undefined", "input"]);

function isNode(v: unknown): v is AnyNode {
  return Boolean(v && typeof v === "object" && typeof (v as Node).type === "string");
}

function children(node: AnyNode): AnyNode[] {
  const out: AnyNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "start" || key === "end" || key === "type") continue;
    if (Array.isArray(value)) value.forEach((v) => isNode(v) && out.push(v));
    else if (isNode(value)) out.push(value);
  }
  return out;
}

/** Names a binding pattern declares: `x`, `[a, b]`, `{ k: v, ...rest }`, `y = 1`. */
function patternNames(p: AnyNode | null | undefined, out: Set<string>) {
  if (!p) return;
  switch (p.type) {
    case "Identifier":
      out.add(p.name as string);
      break;
    case "ArrayPattern":
      (p.elements as (AnyNode | null)[]).forEach((e) => patternNames(e, out));
      break;
    case "ObjectPattern":
      for (const prop of p.properties as AnyNode[]) patternNames((prop.type === "RestElement" ? prop.argument : prop.value) as AnyNode, out);
      break;
    case "RestElement":
      patternNames(p.argument as AnyNode, out);
      break;
    case "AssignmentPattern":
      patternNames(p.left as AnyNode, out);
      break;
  }
}

/** `var` and function declarations anywhere in a function body, not inside nested functions. */
function hoistedNames(body: AnyNode, out: Set<string>) {
  const visit = (n: AnyNode) => {
    if (n.type === "VariableDeclaration" && n.kind === "var") {
      for (const d of n.declarations as AnyNode[]) patternNames(d.id as AnyNode, out);
    }
    if (n.type === "FunctionDeclaration") {
      if (n.id) out.add((n.id as AnyNode).name as string);
      return;
    }
    if (FUNCTIONS.has(n.type) || n.type === "ClassDeclaration" || n.type === "ClassExpression") return;
    children(n).forEach(visit);
  };
  children(body).forEach(visit);
}

/** let, const and class declared directly in a statement list. */
function lexicalNames(statements: AnyNode[], out: Set<string>) {
  for (const s of statements) {
    if (s.type === "VariableDeclaration" && s.kind !== "var") {
      for (const d of s.declarations as AnyNode[]) patternNames(d.id as AnyNode, out);
    }
    if (s.type === "ClassDeclaration" && s.id) out.add((s.id as AnyNode).name as string);
  }
}

/** Which kind of step a statement is, judged from its shape and text. */
function eventOf(s: AnyNode, text: string): string | null {
  if (s.type === "ReturnStatement") return "return";
  if (s.type === "IfStatement") return "compare";
  if (s.type === "ExpressionStatement") {
    const e = s.expression as AnyNode;
    if (
      e.type === "AssignmentExpression" &&
      (e.left as AnyNode).type === "ArrayPattern" &&
      ((e.left as AnyNode).elements as AnyNode[]).every((x) => x?.type === "MemberExpression")
    ) {
      return "swap";
    }
    if (/\.(push|unshift|append|appendleft|offer|enqueue)\(/.test(text)) return "push";
    if (/\.(pop|shift|popleft|poll|dequeue)\(/.test(text)) return "pop";
    if (/\.(add|set)\(/.test(text)) return "insert";
    if (/\.(delete|remove|discard)\(/.test(text)) return "remove";
    if (e.type === "AssignmentExpression" || e.type === "UpdateExpression") return "update";
  }
  return null;
}

function functionName(fn: AnyNode, parent: AnyNode | null): string {
  if (fn.id) return (fn.id as AnyNode).name as string;
  if (parent?.type === "VariableDeclarator" && (parent.id as AnyNode).type === "Identifier") return (parent.id as AnyNode).name as string;
  if ((parent?.type === "MethodDefinition" || parent?.type === "Property") && (parent.key as AnyNode).type === "Identifier") {
    return (parent.key as AnyNode).name as string;
  }
  if (parent?.type === "AssignmentExpression" && (parent.left as AnyNode).type === "Identifier") return (parent.left as AnyNode).name as string;
  return "fn";
}

export function instrumentJs(source: string, opts: InstrumentOptions): Instrumented {
  const { ast } = parseProgram(source);
  const hidden = new Set(opts.hiddenFunctions ?? []);
  // Insertions by position; at one position they're applied in the order they were added.
  const inserts = new Map<number, string[]>();
  const insert = (pos: number, text: string) => inserts.set(pos, [...(inserts.get(pos) ?? []), text]);
  const loops: Instrumented["loops"] = [];
  const seenLoops = new Set<string>();

  const visible = (ctx: Ctx) => {
    const names = new Set<string>();
    for (const s of ctx.scopes) s.names.forEach((n) => names.add(n));
    return [...names].filter((n) => !n.startsWith("__") && !HIDDEN_NAMES.has(n));
  };
  // Each read in its own try: a let not yet declared (TDZ) mustn't lose the others.
  const snapshot = (ctx: Ctx) =>
    `function () { var __o = {}; ${visible(ctx)
      .map((n) => `try { __o[${JSON.stringify(n)}] = ${n}; } catch (__e) {}`)
      .join(" ")} return __o; }`;

  const lineOf = (n: AnyNode) => (n.loc ? opts.lineFor(n.loc.start.line) : null);

  /**
   * A statement in a statement list, or a lone body we've wrapped in braces. A loop gets no step of its
   * own: each iteration records one on its line instead.
   */
  function statement(s: AnyNode, ctx: Ctx) {
    const line = ctx.inFunction && !SKIPPED_STATEMENTS.has(s.type) && !LOOPS.has(s.type) ? lineOf(s) : null;
    if (line !== null) {
      const event = eventOf(s, source.slice(s.start, s.end));
      const call = `__step(${line}, ${JSON.stringify(ctx.loopId)}, ${JSON.stringify(event)}, ${snapshot(ctx)});`;
      // The leading semicolon guards against a statement that relied on automatic semicolon insertion.
      if (AFTER_STATEMENTS.has(s.type)) insert(s.end, `;${call}`);
      else insert(s.start, call);
    }
    descend(s, ctx);
  }

  /** A loop, if or label body that may not be a block: braced so a step can go in front of it. */
  function body(b: AnyNode, ctx: Ctx, loop?: { id: string; line: number }) {
    if (b.type === "BlockStatement") {
      const scope: Scope = { names: new Set() };
      lexicalNames(b.body as AnyNode[], scope.names);
      const inner = { ...ctx, scopes: [...ctx.scopes, scope] };
      if (loop) insert(b.start + 1, `__iter(${JSON.stringify(loop.id)}, ${loop.line}, ${snapshot(inner)});`);
      (b.body as AnyNode[]).forEach((s) => statement(s, inner));
      return;
    }
    insert(b.start, "{ ");
    if (loop) insert(b.start, `__iter(${JSON.stringify(loop.id)}, ${loop.line}, ${snapshot(ctx)}); `);
    statement(b, ctx);
    insert(b.end, " }");
  }

  function fn(f: AnyNode, parent: AnyNode | null, ctx: Ctx) {
    const scope: Scope = { names: new Set() };
    for (const p of f.params as AnyNode[]) patternNames(p, scope.names);
    const name = functionName(f, parent);
    if (f.type === "FunctionExpression" && f.id) scope.names.add(name);
    const inner: Ctx = { scopes: [...ctx.scopes, scope], loopId: null, inFunction: true };
    const b = f.body as AnyNode;
    if (b.type !== "BlockStatement") {
      // An expression body (`x => x * 2`) holds no statements to step through.
      descend(b, inner);
      return;
    }
    hoistedNames(b, scope.names);
    lexicalNames(b.body as AnyNode[], scope.names);
    if (!hidden.has(name)) {
      const simple = (f.params as AnyNode[]).every((p) => p.type === "Identifier");
      const args = simple ? `[${(f.params as AnyNode[]).map((p) => p.name).join(", ")}]` : "[]";
      insert(b.start + 1, `__enter(${JSON.stringify(name)}, ${args}); try {`);
      insert(b.end - 1, `} finally { __exit(); }`);
    }
    (b.body as AnyNode[]).forEach((s) => statement(s, inner));
  }

  /** Walks into a node, opening scopes and handling the bodies of loops, ifs and functions. */
  function descend(n: AnyNode, ctx: Ctx, parent: AnyNode | null = null) {
    if (FUNCTIONS.has(n.type)) return fn(n, parent, ctx);
    if (n.type === "BlockStatement" || n.type === "StaticBlock") {
      const scope: Scope = { names: new Set() };
      lexicalNames(n.body as AnyNode[], scope.names);
      const inner = { ...ctx, scopes: [...ctx.scopes, scope] };
      (n.body as AnyNode[]).forEach((s) => statement(s, inner));
      return;
    }
    if (n.type === "IfStatement") {
      descend(n.test as AnyNode, ctx, n);
      body(n.consequent as AnyNode, ctx);
      if (n.alternate) body(n.alternate as AnyNode, ctx);
      return;
    }
    if (LOOPS.has(n.type)) {
      const scope: Scope = { names: new Set() };
      for (const key of ["init", "left"]) {
        const head = n[key] as AnyNode | undefined;
        if (head?.type === "VariableDeclaration" && head.kind !== "var") {
          for (const d of head.declarations as AnyNode[]) patternNames(d.id as AnyNode, scope.names);
        }
      }
      const inner: Ctx = { ...ctx, scopes: [...ctx.scopes, scope] };
      for (const key of ["init", "test", "update", "left", "right"]) {
        const part = n[key];
        if (isNode(part)) descend(part, inner, n);
      }
      const line = ctx.inFunction ? lineOf(n) : null;
      const loop = line !== null ? { id: `L${line}`, line } : undefined;
      if (loop && !seenLoops.has(loop.id)) {
        seenLoops.add(loop.id);
        loops.push(loop);
      }
      body(n.body as AnyNode, loop ? { ...inner, loopId: loop.id } : inner, loop);
      return;
    }
    if (n.type === "LabeledStatement") return descend(n.body as AnyNode, ctx, n);
    if (n.type === "SwitchStatement") {
      descend(n.discriminant as AnyNode, ctx, n);
      const scope: Scope = { names: new Set() };
      for (const c of n.cases as AnyNode[]) lexicalNames(c.consequent as AnyNode[], scope.names);
      const inner = { ...ctx, scopes: [...ctx.scopes, scope] };
      for (const c of n.cases as AnyNode[]) {
        if (c.test) descend(c.test as AnyNode, inner, c);
        (c.consequent as AnyNode[]).forEach((s) => statement(s, inner));
      }
      return;
    }
    if (n.type === "CatchClause") {
      const scope: Scope = { names: new Set() };
      patternNames(n.param as AnyNode | null, scope.names);
      return descend(n.body as AnyNode, { ...ctx, scopes: [...ctx.scopes, scope] }, n);
    }
    for (const c of children(n)) descend(c, ctx, n);
  }

  const top: Scope = { names: new Set() };
  hoistedNames(ast as AnyNode, top.names);
  lexicalNames((ast as AnyNode).body as AnyNode[], top.names);
  const rootCtx: Ctx = { scopes: [top], loopId: null, inFunction: false };
  for (const s of (ast as AnyNode).body as AnyNode[]) {
    if (STATEMENT_LISTS.has(s.type)) descend(s, rootCtx);
    else statement(s, rootCtx);
  }

  let out = source;
  for (const pos of [...inserts.keys()].sort((a, b) => b - a)) {
    out = out.slice(0, pos) + inserts.get(pos)!.join("") + out.slice(pos);
  }
  return { program: out, loops };
}
