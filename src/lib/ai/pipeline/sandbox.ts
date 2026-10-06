import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";

export const TRACE_EVENT_LIMIT = 500;
const TIME_LIMIT_MS = 2_000;
const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;

export type RawTraceEvent = {
  line?: unknown;
  loop?: unknown;
  event?: unknown;
  states?: unknown;
  pointers?: unknown;
  highlights?: unknown;
};

export type SandboxOutcome =
  | "ok"
  | "timeout" // hit the time limit: most likely an infinite loop
  | "trace_limit" // more than TRACE_EVENT_LIMIT trace() calls
  | "runtime_error" // the learner's logic threw (null access, stack overflow…)
  | "invalid_program"; // our translation is broken: syntax error, no run()

export type SandboxResult = {
  outcome: SandboxOutcome;
  events: RawTraceEvent[];
  returnValue: string | null;
  errorMessage: string | null;
};

/**
 * Runs inside QuickJS before the generated program. Helpers snapshot live
 * values into StructureState objects, so the program only has to say what
 * to show, not how to serialize it. Nothing from the host is exposed.
 */
const PRELUDE = String.raw`
"use strict";
var console = { log: function () {}, warn: function () {}, error: function () {}, info: function () {} };
var __events = [];
var __ids = new WeakMap();
var __idc = 0;
function __nodeId(o) {
  if (o === null || o === undefined) return null;
  if (typeof o !== "object") return String(o);
  var v = __ids.get(o);
  if (!v) { v = "n" + (++__idc); __ids.set(o, v); }
  return v;
}
function __short(v) {
  try {
    var s = JSON.stringify(v, function (k, x) {
      if (x instanceof Map) return Object.fromEntries(x);
      if (x instanceof Set) return Array.from(x);
      return x;
    });
    if (s === undefined) return String(v);
    return s.length > 60 ? s.slice(0, 57) + "..." : s;
  } catch (e) { return String(v); }
}
function __prim(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return isFinite(v) ? v : String(v);
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "bigint") return String(v);
  return __short(v);
}
function __scalar(v) { var p = __prim(v); return typeof p === "boolean" ? String(p) : p; }
function __disp(v) {
  if (v instanceof Set) v = Array.from(v);
  if (Array.isArray(v)) return v.slice(0, 20).map(__prim);
  return __prim(v);
}
function __list(x) {
  if (x === null || x === undefined) return [];
  if (typeof x === "string") return x.split("");
  return Array.from(x);
}
var S = {
  array: function (a) { return { kind: "array", values: __list(a).map(__scalar) }; },
  string: function (s) { return { kind: "string", values: __list(s).map(__scalar) }; },
  hashmap: function (m) {
    var e = m instanceof Map ? Array.from(m.entries()) : Object.entries(m || {});
    return { kind: "hashmap", entries: e.map(function (kv) {
      var k = typeof kv[0] === "number" ? kv[0] : String(__prim(kv[0]));
      return [k, __disp(kv[1])];
    }) };
  },
  set: function (s) { return { kind: "set", values: __list(s).map(__prim) }; },
  stack: function (a) { return { kind: "stack", items: __list(a).map(__disp) }; },
  queue: function (a) { return { kind: "queue", items: __list(a).map(__disp) }; },
  linkedList: function (head, o) {
    o = o || {};
    var vk = o.value || "val", nk = o.next || "next";
    var nodes = [], seen = new Set(), cur = head;
    while (cur && typeof cur === "object" && !seen.has(cur) && nodes.length < 50) {
      seen.add(cur);
      var nx = cur[nk];
      nodes.push({ id: __nodeId(cur), value: __scalar(cur[vk]), next: nx ? __nodeId(nx) : null });
      cur = nx;
    }
    return { kind: "linkedList", nodes: nodes, headId: head ? __nodeId(head) : null };
  },
  tree: function (root, o) {
    o = o || {};
    var vk = o.value || "val", lk = o.left || "left", rk = o.right || "right", ck = o.children || "children";
    var nodes = [], seen = new Set(), queue = root ? [root] : [];
    while (queue.length && nodes.length < 63) {
      var n = queue.shift();
      if (!n || typeof n !== "object" || seen.has(n)) continue;
      seen.add(n);
      var entry = { id: __nodeId(n), value: __scalar(n[vk]) };
      if (Array.isArray(n[ck])) {
        entry.children = n[ck].filter(Boolean).map(__nodeId);
        n[ck].forEach(function (c) { if (c) queue.push(c); });
      } else {
        entry.left = n[lk] ? __nodeId(n[lk]) : null;
        entry.right = n[rk] ? __nodeId(n[rk]) : null;
        if (n[lk]) queue.push(n[lk]);
        if (n[rk]) queue.push(n[rk]);
      }
      nodes.push(entry);
    }
    return { kind: "tree", nodes: nodes, rootId: root ? __nodeId(root) : null };
  },
  graph: function (adj, directed) {
    var entries = adj instanceof Map ? Array.from(adj.entries()) : Object.entries(adj || {});
    var ids = [], seenIds = new Set(), edges = [], seenEdges = new Set();
    function addNode(x) { var s = String(x); if (!seenIds.has(s)) { seenIds.add(s); ids.push(s); } return s; }
    entries.forEach(function (kv) {
      var from = addNode(kv[0]);
      __list(kv[1]).forEach(function (nb) {
        var to, w;
        if (Array.isArray(nb)) { to = nb[0]; w = nb[1]; }
        else if (nb && typeof nb === "object") { to = nb.to !== undefined ? nb.to : nb.node; w = nb.weight; }
        else { to = nb; }
        to = addNode(to);
        var key = directed ? from + ">" + to : [from, to].sort().join("~");
        if (seenEdges.has(key)) return;
        seenEdges.add(key);
        var e = { from: from, to: to };
        if (typeof w === "number") e.weight = w;
        edges.push(e);
      });
    });
    return { kind: "graph", nodes: ids.map(function (s) { return { id: s, label: s }; }), edges: edges, directed: !!directed };
  },
  matrix: function (rows) { return { kind: "matrix", rows: __list(rows).map(function (r) { return __list(r).map(__scalar); }) }; },
  vars: function (o) { var out = {}; for (var k in o) out[k] = __prim(o[k]); return { kind: "variables", vars: out }; }
};
function nodeId(o) { return __nodeId(o); }
function trace(ev) {
  if (__events.length >= ${TRACE_EVENT_LIMIT}) throw new Error("__TRACE_LIMIT__");
  ev = ev || {};
  __events.push(JSON.parse(JSON.stringify({
    line: ev.line, loop: ev.loop || null, event: ev.event || null,
    states: ev.states || {}, pointers: ev.pointers || [], highlights: ev.highlights || []
  })));
}
`;

/**
 * Runs in a throwaway worker thread. QuickJS can take its WASM module down
 * with it (e.g. on runaway recursion), so it never runs in the server's own
 * thread. The result is posted before any teardown, which may itself abort.
 */
const WORKER_SOURCE = String.raw`
const { parentPort, workerData } = process.getBuiltinModule("node:worker_threads");
const { createRequire } = process.getBuiltinModule("node:module");
const { newQuickJSWASMModule, shouldInterruptAfterDeadline } = createRequire(workerData.resolveFrom)("quickjs-emscripten");

function errorText(err) {
  if (err && typeof err === "object") return [err.name, err.message].filter(Boolean).join(": ") || "Unknown error";
  return String(err);
}

(async () => {
  const QuickJS = await newQuickJSWASMModule();
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(workerData.memoryLimit);
  runtime.setMaxStackSize(workerData.stackLimit);
  const vm = runtime.newContext();
  const read = (code, fallback) => {
    runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + 500));
    const r = vm.evalCode(code);
    if (r.error) return fallback;
    return vm.dump(r.value);
  };
  const done = (result) => parentPort.postMessage(result);

  const setup = vm.evalCode(workerData.prelude, "prelude.js");
  if (setup.error) throw new Error("prelude failed: " + errorText(vm.dump(setup.error)));

  const defined = vm.evalCode(workerData.program + "\n;typeof run === 'function'", "program.js");
  if (defined.error) {
    return done({ outcome: "invalid_program", events: [], returnValue: null, errorMessage: errorText(vm.dump(defined.error)) });
  }
  if (!vm.dump(defined.value)) {
    return done({ outcome: "invalid_program", events: [], returnValue: null, errorMessage: "run(input) is not defined" });
  }

  runtime.setInterruptHandler(shouldInterruptAfterDeadline(Date.now() + workerData.timeLimit));
  const ran = vm.evalCode(workerData.wrapped, "run.js");
  if (ran.error) {
    // Uncatchable inside QuickJS: the interrupt handler fired or memory ran out.
    const text = errorText(vm.dump(ran.error));
    const timedOut = /interrupted/i.test(text);
    return done({
      outcome: timedOut ? "timeout" : "runtime_error",
      events: read("__events", []),
      returnValue: null,
      errorMessage: timedOut ? "Stopped after " + workerData.timeLimit / 1000 + "s without finishing" : text,
    });
  }
  const out = JSON.parse(String(vm.dump(ran.value)));
  const events = read("__events", []);
  if (out.ok) return done({ outcome: "ok", events, returnValue: out.value, errorMessage: null });
  if (out.error === "__TRACE_LIMIT__") {
    return done({ outcome: "trace_limit", events, returnValue: null, errorMessage: "Still running after " + workerData.traceLimit + " traced steps" });
  }
  return done({ outcome: "runtime_error", events, returnValue: null, errorMessage: out.error });
})().catch((err) => parentPort.postMessage({ outcome: "runtime_error", events: [], returnValue: null, errorMessage: errorText(err) }));
`;

/** Wall-clock backstop in case the worker wedges outside QuickJS's own checks. */
const HARD_TIMEOUT_MS = TIME_LIMIT_MS + 8_000;

/**
 * Executes LLM-generated code in QuickJS with memory, time and trace-event
 * limits, inside a disposable worker thread. No network, filesystem or host
 * functions are reachable from the program. This is the only place
 * generated code ever runs.
 */
export function runInSandbox(program: string, input: unknown): Promise<SandboxResult> {
  const wrapped = `
    var __out = { ok: true, value: null, error: null };
    try {
      var __v = run(JSON.parse(${JSON.stringify(JSON.stringify(input ?? {}))}));
      __out.value = __v === undefined ? "undefined" : __short(__v);
    } catch (e) {
      __out.ok = false;
      __out.error = String((e && e.message) || e);
    }
    JSON.stringify(__out);
  `;

  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        resolveFrom: path.join(process.cwd(), "package.json"),
        prelude: PRELUDE,
        program,
        wrapped,
        timeLimit: TIME_LIMIT_MS,
        traceLimit: TRACE_EVENT_LIMIT,
        memoryLimit: MEMORY_LIMIT_BYTES,
        stackLimit: STACK_LIMIT_BYTES,
      },
      resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 32, stackSizeMb: 8 },
      stdout: true,
      stderr: true,
    });
    let settled = false;
    const finish = (result: SandboxResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(
      () => finish({ outcome: "timeout", events: [], returnValue: null, errorMessage: "Stopped: the program never finished" }),
      HARD_TIMEOUT_MS,
    );
    worker.on("message", (result: SandboxResult) => finish(result));
    const crashed = () =>
      finish({
        outcome: "runtime_error",
        events: [],
        returnValue: null,
        errorMessage: "The program crashed the interpreter, most likely through unbounded recursion",
      });
    worker.on("error", (e) => {
      console.error("[sandbox] worker crashed:", e.message);
      crashed();
    });
    worker.on("exit", crashed);
  });
}
