import { HARNESS_RUNTIME } from "@/lib/harness/runtime";
import { instrumentJs, parseProgram } from "@/lib/trace/instrument";
import { AUTO_TRACE_LIMIT, AUTO_TRACE_RUNTIME } from "@/lib/trace/runtime";
import { jsDefinitions, resolveEntry, type Definition } from "./entry";
import type { RunCall } from "./protocol";

/** "Line 3: SyntaxError: Unexpected token" from acorn's or sucrase's "Unexpected token (3:4)". */
function syntaxText(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const at = /\((\d+):(\d+)\)\s*$/.exec(message);
  return at ? `Line ${at[1]}: SyntaxError: ${message.replace(at[0], "").trim()}` : `SyntaxError: ${message}`;
}

/**
 * The learner's JS or TS as a script the worker can load: types stripped (sucrase keeps line numbers),
 * `export` dropped, and with `trace`, instrumented so every statement records a step on its own line.
 * Also works out which of their functions the tests call (resolveEntry()).
 */
export async function prepareJs(
  language: "javascript" | "typescript",
  code: string,
  trace: boolean,
  call: RunCall,
): Promise<
  { program: string; loops: { id: string; line: number }[]; entry: Definition; note: string | null } | { error: string }
> {
  let js = code.replace(/^(\s*)export\s+(default\s+)?/gm, "$1");
  if (language === "typescript") {
    const { transform } = await import("sucrase");
    try {
      js = transform(js, { transforms: ["typescript"], disableESTransforms: true }).code;
    } catch (err) {
      return { error: syntaxText(err) };
    }
  }
  let defs: Definition[];
  try {
    defs = jsDefinitions(parseProgram(js).ast);
  } catch (err) {
    return { error: syntaxText(err) };
  }
  const found = resolveEntry(defs, call.functionName, call.params.map((p) => p.name));
  if ("error" in found) return found;
  if (!trace) return { program: js, loops: [], ...found };
  const inst = instrumentJs(js, { lineFor: (line) => line - 1 });
  return { program: inst.program, loops: inst.loops, ...found };
}

/** The runtime the learner's code loads after: hidden ListNode/TreeNode and the step recorder. */
export const JS_RUNTIME = HARNESS_RUNTIME + AUTO_TRACE_RUNTIME;

/**
 * The worker's own script: loads the runtime and the learner's code (separate blobs, so error stacks
 * point at the code's own lines), then calls their function on cases `from` onward, posting each
 * result. console.* is captured as the case's output.
 */
export function jsWorkerSource(o: {
  runtimeUrl: string;
  codeUrl: string;
  call: RunCall;
  /** The learner's function the tests call (see resolveEntry()). */
  entry: Definition;
  cases: Record<string, unknown>[];
  from: number;
  trace: boolean;
}): string {
  const name = o.entry.name;
  return `
"use strict";
var __out = [];
function __fmt(v) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, function (k, x) {
      if (x instanceof Map) return Object.fromEntries(x);
      if (x instanceof Set) return Array.from(x);
      if (typeof x === "bigint") return String(x);
      return x;
    });
  } catch (e) { return String(v); }
}
var __log = function () { __out.push(Array.prototype.map.call(arguments, __fmt).join(" ")); };
self.console = { log: __log, info: __log, warn: __log, error: __log, debug: __log };
var __codeUrl = ${JSON.stringify(o.codeUrl)};
function __errText(e) {
  var text = e && e.name ? e.name + ": " + e.message : String(e);
  var stack = (e && e.stack) || "";
  var i = stack.indexOf(__codeUrl + ":");
  if (i >= 0) {
    var m = /^:(\\d+)/.exec(stack.slice(i + __codeUrl.length));
    if (m) return "Line " + m[1] + ": " + text;
  }
  return text;
}
var __loaded = false;
try {
  importScripts(${JSON.stringify(o.runtimeUrl)}, __codeUrl);
  __loaded = true;
} catch (e) {
  postMessage({ type: "fatal", error: __errText(e) });
}
var __call = ${JSON.stringify(o.call)};
var __cases = ${JSON.stringify(o.cases)};
function __fn() {
  ${o.entry.method ? `var s = new Solution(); return s.${name}.bind(s);` : `return ${name};`}
}
for (var __i = __loaded ? ${o.from} : __cases.length; __i < __cases.length; __i++) {
  postMessage({ type: "start", i: __i });
  __out = [];
  __resetTrace();
  var __t0 = performance.now(), __res;
  try {
    var __f = __fn();
    var __args = __call.params.map(function (p) { return __hIn(p.type, structuredClone(__cases[__i][p.name])); });
    var __r = __f.apply(null, __args);
    var __oi = __call.outputIndex;
    var __v = __oi !== undefined && __oi !== null ? __args[__oi] : __r;
    var __t = __oi !== undefined && __oi !== null ? __call.params[__oi].type : __call.returnType;
    __res = { status: "ok", actualJson: JSON.stringify(__hOut(__t, __v)) };
  } catch (e) {
    __res = e && e.message === "__TRACE_LIMIT__"
      ? { status: "trace_limit", error: "Stopped after ${AUTO_TRACE_LIMIT} steps: the run is too long to show step by step" }
      : { status: "error", error: __errText(e) };
  }
  __res.output = __out.join("\\n").slice(0, 10000);
  __res.ms = Math.round(performance.now() - __t0);
  ${o.trace ? "__res.events = __events.slice();" : ""}
  postMessage({ type: "case", i: __i, result: __res });
}
if (__loaded) postMessage({ type: "done" });
`;
}
