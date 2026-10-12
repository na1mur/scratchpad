import "server-only";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { HARNESS_RUNTIME } from "@/lib/harness/runtime";
import { AUTO_TRACE_LIMIT, AUTO_TRACE_RUNTIME } from "@/lib/trace/runtime";
import type { ValueType } from "@/lib/harness/types";

const TIME_LIMIT_MS = 2_000;
const MEMORY_LIMIT_BYTES = 64 * 1024 * 1024;
const STACK_LIMIT_BYTES = 512 * 1024;

export type SandboxOutcome =
  | "ok"
  | "timeout" // hit the time limit: most likely an infinite loop
  | "trace_limit" // more steps than AUTO_TRACE_LIMIT
  | "runtime_error" // the learner's logic threw (null access, stack overflow…)
  | "invalid_program"; // our translation is broken: syntax error, no run()

export type SandboxResult = {
  outcome: SandboxOutcome;
  /** Steps the run recorded (AutoEvent in src/lib/trace/steps.ts). */
  events: unknown[];
  /** Short display form of what it returned. */
  returnValue: string | null;
  /** The whole return value as JSON, in the harness's form (lists and trees as arrays); null if it didn't return. */
  returnJson: string | null;
  errorMessage: string | null;
};

/**
 * Runs inside QuickJS before the program: silences console and gives __short() for display values.
 * Steps are recorded by AUTO_TRACE_RUNTIME (src/lib/trace/runtime.ts) into __events. Nothing from the
 * host is exposed.
 */
const PRELUDE = String.raw`
"use strict";
var console = { log: function () {}, warn: function () {}, error: function () {}, info: function () {} };
var __events = [];
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

  const defined = vm.evalCode(workerData.program + "\n;" + workerData.entryCheck, "program.js");
  if (defined.error) {
    return done({ outcome: "invalid_program", events: [], returnValue: null, returnJson: null, errorMessage: errorText(vm.dump(defined.error)) });
  }
  if (!vm.dump(defined.value)) {
    return done({ outcome: "invalid_program", events: [], returnValue: null, returnJson: null, errorMessage: workerData.entryName + " is not defined" });
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
      returnJson: null,
      errorMessage: timedOut ? "Stopped after " + workerData.timeLimit / 1000 + "s without finishing" : text,
    });
  }
  const out = JSON.parse(String(vm.dump(ran.value)));
  const events = read("__events", []);
  if (out.ok) return done({ outcome: "ok", events, returnValue: out.value, returnJson: out.json, errorMessage: null });
  if (out.error === "__TRACE_LIMIT__") {
    return done({ outcome: "trace_limit", events, returnValue: null, returnJson: null, errorMessage: "Still running after " + workerData.traceLimit + " traced steps" });
  }
  return done({ outcome: "runtime_error", events, returnValue: null, returnJson: null, errorMessage: out.error });
})().catch((err) => parentPort.postMessage({ outcome: "runtime_error", events: [], returnValue: null, returnJson: null, errorMessage: errorText(err) }));
`;

/** Wall-clock backstop in case the worker wedges outside QuickJS's own checks. */
const HARD_TIMEOUT_MS = TIME_LIMIT_MS + 8_000;

const failed = (outcome: SandboxOutcome, errorMessage: string): SandboxResult => ({
  outcome,
  events: [],
  returnValue: null,
  returnJson: null,
  errorMessage,
});

/**
 * Executes LLM-generated code in QuickJS with memory, time and trace-event
 * limits, inside a disposable worker thread. No network, filesystem or host
 * functions are reachable from the program. This is the only place
 * generated code ever runs. `wrapped` calls into the program and evaluates
 * to the JSON of {ok, value, json, error}; `entry.check` is an expression
 * that's true once the program has defined what `wrapped` calls.
 */
function execute(program: string, wrapped: string, entry: { check: string; name: string }): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        resolveFrom: path.join(process.cwd(), "package.json"),
        prelude: PRELUDE + HARNESS_RUNTIME + AUTO_TRACE_RUNTIME,
        program,
        wrapped,
        entryCheck: entry.check,
        entryName: entry.name,
        timeLimit: TIME_LIMIT_MS,
        traceLimit: AUTO_TRACE_LIMIT,
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
    const timer = setTimeout(() => finish(failed("timeout", "Stopped: the program never finished")), HARD_TIMEOUT_MS);
    worker.on("message", (result: SandboxResult) => finish(result));
    const crashed = () =>
      finish(failed("runtime_error", "The program crashed the interpreter, most likely through unbounded recursion"));
    worker.on("error", (e) => {
      console.error("[sandbox] worker crashed:", e.message);
      crashed();
    });
    worker.on("exit", crashed);
  });
}

/** Longest whole return value kept; past it the answer is surely wrong anyway. */
const RETURN_JSON_LIMIT = 50_000;

/** Fills __out from a call's result `__v`; with a type, also its whole value as harness JSON. */
function captureReturn(returnType: ValueType | undefined): string {
  const json = returnType
    ? `__out.json = JSON.stringify(__hOut(${JSON.stringify(returnType)}, __v));
      if (__out.json && __out.json.length > ${RETURN_JSON_LIMIT}) __out.json = null;`
    : "";
  return `__out.value = __v === undefined ? "undefined" : __short(__v);
      ${json}`;
}

function wrap(call: string): string {
  return `
    var __out = { ok: true, value: null, json: null, error: null };
    try {
      ${call}
    } catch (e) {
      __out.ok = false;
      __out.error = String((e && e.message) || e);
    }
    JSON.stringify(__out);
  `;
}

const literal = (value: unknown) => `JSON.parse(${JSON.stringify(JSON.stringify(value ?? {}))})`;

/**
 * Runs an instrumented program's run(input). With `returnType` (from the problem's harness), the result
 * also carries the whole return value as harness JSON, so it can be compared with the expected answer.
 */
export function runInSandbox(program: string, input: unknown, returnType?: ValueType): Promise<SandboxResult> {
  const wrapped = wrap(`var __v = run(${literal(input)});
      ${captureReturn(returnType)}`);
  return execute(program, wrapped, { check: "typeof run === 'function'", name: "run(input)" });
}

/** How to call a solution: a ReadyHarness with its types parsed. */
export type FunctionCall = {
  functionName: string;
  params: { name: string; type: ValueType }[];
  returnType: ValueType;
  /** Index of the parameter that holds the answer of a void function. */
  outputIndex?: number;
};

/**
 * Calls a plain solution function (no trace() calls needed) on one case's arguments, built into
 * ListNodes and TreeNodes as the types say, and returns the answer as harness JSON in `returnJson`.
 * Finds `functionName` at the top level or as a method of a LeetCode-style `Solution` class.
 */
export function runFunction(program: string, call: FunctionCall, args: Record<string, unknown>): Promise<SandboxResult> {
  const name = call.functionName;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return Promise.resolve(failed("invalid_program", `bad function name ${name}`));
  const output = call.outputIndex;
  const wrapped = wrap(`var __fn = typeof ${name} === "function" ? ${name} : null;
      if (!__fn) { var __s = new Solution(); __fn = __s.${name}.bind(__s); }
      var __raw = ${literal(args)};
      var __args = ${JSON.stringify(call.params)}.map(function (p) { return __hIn(p.type, __raw[p.name]); });
      var __r = __fn.apply(null, __args);
      var __v = ${output !== undefined ? `__args[${output}]` : "__r"};
      ${captureReturn(output !== undefined ? call.params[output].type : call.returnType)}`);
  return execute(program, wrapped, {
    check: `typeof ${name} === "function" || (typeof Solution === "function" && typeof Solution.prototype.${name} === "function")`,
    name,
  });
}
