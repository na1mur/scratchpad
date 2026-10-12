import { parseType, type HarnessView, type ValueType } from "@/lib/harness/types";
import { JS_RUNTIME, jsWorkerSource, prepareJs } from "./js";
import type { CaseResult, PythonRunMessage, RunCall, RunLanguage, WorkerMessage } from "./protocol";
import { pythonWorkerSource } from "./python";

type ReadyView = Extract<HarnessView, { status: "ready" }>;

/** A case that runs longer than this is stopped (its worker is killed) and the rest run in a new one. */
const CASE_TIMEOUT_MS = { plain: 3_000, traced: 8_000 };
/** The first Python run downloads Pyodide (~10 MB); after that it's cached. */
const PYTHON_LOAD_TIMEOUT_MS = 120_000;

export type RunState = {
  phase: "preparing" | "loading" | "running" | "done";
  results: (CaseResult | null)[];
  /** The case running now. */
  current: number | null;
  /** The code couldn't run at all. */
  fatal?: string;
  /** Python's loops, found while loading (JS gets them from the instrumenter). */
  loops: { id: string; line: number }[];
  /** Set when the function that ran isn't named as in the signature ("Ran your foo as bar"). */
  note?: string;
};

export function runCall(view: ReadyView): RunCall {
  const outputIndex = view.outputParam ? view.params.findIndex((p) => p.name === view.outputParam) : -1;
  return {
    functionName: view.functionName,
    params: view.params.map((p) => ({ name: p.name, type: parseType(p.type) as ValueType })),
    returnType: parseType(view.returnType) as ValueType,
    ...(outputIndex >= 0 && { outputIndex }),
  };
}

// Pyodide takes seconds to start, so its worker outlives a run; one that hung is replaced.
let pythonWorker: Worker | null = null;
let pythonReady = false;
// One Python run at a time: they share the worker, so a new run stops one still going.
let stopPythonRun: (() => void) | null = null;

function newPythonWorker(): Worker {
  const url = URL.createObjectURL(new Blob([pythonWorkerSource()], { type: "text/javascript" }));
  const worker = new Worker(url);
  URL.revokeObjectURL(url);
  pythonReady = false;
  return worker;
}

function killPython() {
  pythonWorker?.terminate();
  pythonWorker = null;
  pythonReady = false;
}

/**
 * Runs the learner's code on every case in a worker and reports progress through `onUpdate`. A hung
 * case is stopped after a few seconds and marked `timeout`; the rest still run. `stop()` ends the run.
 */
export function runCode(opts: {
  language: RunLanguage;
  code: string;
  view: ReadyView;
  trace: boolean;
  onUpdate: (state: RunState) => void;
}): { done: Promise<RunState>; stop: () => void } {
  const call = runCall(opts.view);
  const cases = opts.view.cases.map((c) => JSON.parse(c.argsJson) as Record<string, unknown>);
  const state: RunState = { phase: "preparing", results: cases.map(() => null), current: null, loops: [] };
  const publish = () => opts.onUpdate({ ...state, results: [...state.results] });
  const caseTimeout = opts.trace ? CASE_TIMEOUT_MS.traced : CASE_TIMEOUT_MS.plain;
  let stopped = false;
  let active: Worker | null = null;
  const urls: string[] = [];
  let finishSegment: (() => void) | null = null;

  /** Runs cases from `from` on in `worker`; resolves with the index to continue from, or null when finished. */
  const segment = (worker: Worker, from: number, start: () => void, loadTimeout = 0): Promise<number | null> =>
    new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = (ms: number, onFire: () => void) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(onFire, ms);
      };
      const end = (next: number | null) => {
        if (timer) clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        finishSegment = null;
        resolve(next);
      };
      finishSegment = () => end(null);
      const hung = (i: number) => () => {
        worker.terminate();
        if (worker === pythonWorker) killPython();
        state.results[i] = { status: "timeout", error: `Stopped after ${caseTimeout / 1000}s: it most likely never finishes`, output: "", ms: caseTimeout };
        state.current = null;
        publish();
        end(i + 1 < cases.length ? i + 1 : null);
      };
      if (loadTimeout) {
        arm(loadTimeout, () => {
          killPython();
          state.fatal = "Python took too long to load. Check your connection and try again.";
          end(null);
        });
      }
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const m = e.data;
        if (m.type === "loading") {
          state.phase = "loading";
          publish();
        } else if (m.type === "start") {
          if (worker === pythonWorker) pythonReady = true;
          state.phase = "running";
          state.current = m.i;
          publish();
          arm(caseTimeout, hung(m.i));
        } else if (m.type === "case") {
          state.results[m.i] = m.result;
          if (m.result.note) state.note = m.result.note;
          state.current = null;
          publish();
          if (timer) clearTimeout(timer);
        } else if (m.type === "done") {
          if (m.loops) state.loops = m.loops;
          end(null);
        } else if (m.type === "fatal") {
          state.fatal = m.error;
          end(null);
        }
      };
      worker.onerror = (e) => {
        e.preventDefault();
        state.fatal = e.message || "The code couldn't run.";
        if (worker === pythonWorker) killPython();
        end(null);
      };
      start();
      if (from >= cases.length) end(null);
    });

  const runJs = async () => {
    const prepared = await prepareJs(opts.language as "javascript" | "typescript", opts.code, opts.trace, call);
    if ("error" in prepared) {
      state.fatal = prepared.error;
      return;
    }
    state.loops = prepared.loops;
    if (prepared.note) state.note = prepared.note;
    const blob = (text: string) => {
      const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
      urls.push(url);
      return url;
    };
    const runtimeUrl = blob(JS_RUNTIME);
    const codeUrl = blob(prepared.program);
    let from: number | null = 0;
    while (from !== null && !stopped) {
      const driver = blob(jsWorkerSource({ runtimeUrl, codeUrl, call, entry: prepared.entry, cases, from, trace: opts.trace }));
      const worker = new Worker(driver);
      active = worker;
      from = await segment(worker, from, () => {});
      worker.terminate();
    }
  };

  const runPython = async () => {
    stopPythonRun?.();
    const stopThis = () => {
      stopped = true;
      killPython();
      finishSegment?.();
    };
    stopPythonRun = stopThis;
    let from: number | null = 0;
    while (from !== null && !stopped) {
      pythonWorker ??= newPythonWorker();
      const worker = pythonWorker;
      active = worker;
      const message: PythonRunMessage = { code: opts.code, call, cases, from, trace: opts.trace };
      const start = from;
      from = await segment(worker, start, () => worker.postMessage(message), pythonReady ? 0 : PYTHON_LOAD_TIMEOUT_MS);
    }
    if (stopPythonRun === stopThis) stopPythonRun = null;
  };

  const done = (async () => {
    publish();
    try {
      await (opts.language === "python" ? runPython() : runJs());
    } catch (err) {
      state.fatal = err instanceof Error ? err.message : String(err);
    } finally {
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
    state.phase = "done";
    state.current = null;
    // Cases a fatal error or a stop kept from running.
    state.results = state.results.map((r) => r ?? (state.fatal ? null : { status: "skipped", output: "", ms: 0 }));
    publish();
    return { ...state };
  })();

  return {
    done,
    stop: () => {
      stopped = true;
      // A Python run is mid-case: its worker can't be interrupted, so it goes and a new one loads next time.
      if (active === pythonWorker) killPython();
      else active?.terminate();
      finishSegment?.();
    },
  };
}
