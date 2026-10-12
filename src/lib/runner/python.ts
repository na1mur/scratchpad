import { AUTO_TRACE_LIMIT } from "@/lib/trace/runtime";

/** Pinned: Pyodide's stable 0.29 line, loaded from the CDN the first time a learner runs Python. */
export const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.29.5/full/";

/**
 * What the learner's Python runs with, as on LeetCode: the usual imports and ListNode/TreeNode. Executed
 * into a fresh namespace for every run, so their code can redefine anything in it.
 */
const PY_PRELUDE = String.raw`
from typing import *
import collections, heapq, bisect, functools, itertools, math, string, re, random, operator
from collections import deque, defaultdict, Counter, OrderedDict
from heapq import heappush, heappop, heapify, heappushpop, heapreplace, nlargest, nsmallest
from bisect import bisect_left, bisect_right, insort
from functools import lru_cache, cache, reduce, cmp_to_key
from itertools import accumulate, permutations, combinations, product, chain, groupby, zip_longest, count
from math import inf, gcd, sqrt, ceil, floor, log, log2, comb, factorial

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    # node.value and node.data (other courses' names) read and write val.
    value = property(lambda self: self.val, lambda self, v: setattr(self, "val", v))
    data = value

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
    value = property(lambda self: self.val, lambda self, v: setattr(self, "val", v))
    data = value
`;

/**
 * The runner, loaded once per worker: converts arguments by type, calls the learner's function, converts
 * the answer back, and with tracing on records a step after every line of their code (sys.settrace), in
 * the same snapshot form as the JS runtime (see Snap in src/lib/trace/steps.ts).
 */
export const PY_RUNNER = String.raw`
import json, sys, math, ast, traceback, collections

_PRELUDE = ${JSON.stringify(PY_PRELUDE)}
_FILE = "solution.py"
_LIMIT = ${AUTO_TRACE_LIMIT}
_ns = None
_loops = []
# The functions the learner defined: (name, number of parameters, is a Solution method).
_defs = []

def _val(n):
    for k in ("val", "value", "data"):
        if hasattr(n, k):
            return getattr(n, k)
    return None

def _is_list(v):
    return hasattr(v, "next") and not hasattr(v, "left") and not hasattr(v, "right") and not isinstance(v, type)

def _is_tree(v):
    return (hasattr(v, "left") or hasattr(v, "right")) and not isinstance(v, type)

def _to_list(a):
    head = None
    for x in reversed(a or []):
        head = _ns["ListNode"](x, head)
    return head

def _to_tree(a):
    a = a or []
    if not a or a[0] is None:
        return None
    T = _ns["TreeNode"]
    root = T(a[0]); queue = [root]; i = 1
    while queue and i < len(a):
        n = queue.pop(0)
        if i < len(a) and a[i] is not None:
            n.left = T(a[i]); queue.append(n.left)
        i += 1
        if i < len(a) and a[i] is not None:
            n.right = T(a[i]); queue.append(n.right)
        i += 1
    return root

def _from_list(h):
    out = []
    while h is not None and len(out) < 2000:
        out.append(_plain(_val(h)))
        h = getattr(h, "next", None)
    return out

def _from_tree(r):
    if r is None:
        return []
    out, queue = [], [r]
    while queue and len(out) < 2000:
        n = queue.pop(0)
        if n is None:
            out.append(None); continue
        out.append(_plain(_val(n)))
        queue.append(getattr(n, "left", None)); queue.append(getattr(n, "right", None))
    while out and out[-1] is None:
        out.pop()
    return out

def _plain(v):
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if math.isfinite(v) else str(v)
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (set, frozenset)):
        return [_plain(x) for x in v]
    if isinstance(v, (list, tuple, collections.deque)):
        return [_plain(x) for x in v]
    if _is_list(v):
        return _from_list(v)
    if _is_tree(v):
        return _from_tree(v)
    return str(v)

def _hin(t, v):
    if v is None:
        return None
    k = t["kind"]
    if k == "list":
        return _to_list(v)
    if k == "tree":
        return _to_tree(v)
    if k == "array":
        return [_hin(t["of"], x) for x in v]
    return v

def _hout(t, v):
    k = t["kind"]
    if v is None:
        return [] if k in ("list", "tree") else None
    if k == "list":
        return _from_list(v)
    if k == "tree":
        return _from_tree(v)
    if k == "array":
        if isinstance(v, str):
            v = list(v)
        if isinstance(v, (list, tuple, set, frozenset, collections.deque)) or hasattr(v, "__iter__") and not isinstance(v, dict):
            return [_hout(t["of"], x) for x in v]
        return _plain(v)
    if k == "bool" and isinstance(v, int):
        return bool(v)
    return _plain(v)

def _err_text(e):
    line = None
    for f in traceback.extract_tb(e.__traceback__):
        if f.filename == _FILE:
            line = f.lineno
    text = type(e).__name__ + (": " + str(e) if str(e) else "")
    return ("Line %d: " % line if line else "") + text

def _load(code):
    """Runs the learner's file in a fresh namespace; returns null, or the error as text."""
    global _ns, _loops, _defs
    _ns = {"__name__": "solution"}
    exec(_PRELUDE, _ns)
    try:
        tree = ast.parse(code, _FILE)
    except SyntaxError as e:
        return "Line %s: SyntaxError: %s" % (e.lineno, e.msg)
    _loops = []
    _defs = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            _defs.append((node.name, len(node.args.args), False))
        elif isinstance(node, ast.ClassDef) and node.name == "Solution":
            for m in node.body:
                if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef)) and not m.name.startswith("_"):
                    _defs.append((m.name, max(0, len(m.args.args) - 1), True))
    for node in ast.walk(tree):
        if isinstance(node, (ast.For, ast.While, ast.AsyncFor)) and node.body:
            end = max(getattr(b, "end_lineno", b.lineno) or b.lineno for b in node.body)
            _loops.append({"id": "L%d" % (node.lineno - 1), "line": node.lineno - 1, "start": node.body[0].lineno, "end": end})
    try:
        exec(compile(tree, _FILE, "exec"), _ns)
    except BaseException as e:
        return _err_text(e)
    return None

def _norm(s):
    return s.replace("_", "").lower()

class _NoEntry(Exception):
    pass

def _find(name, params):
    """The function to call and, when it isn't the one named in the signature, a note saying which ran.
    Mirrors resolveEntry() in src/lib/runner/entry.ts."""
    pick = [d for d in _defs if d[0] == name] or [d for d in _defs if _norm(d[0]) == _norm(name)]
    if not pick:
        same = [d for d in _defs if d[1] == len(params)]
        pick = same if len(same) == 1 else (_defs if len(_defs) == 1 else [])
    if not pick:
        found = ", ".join(d[0] for d in _defs) or "none"
        raise _NoEntry("Couldn't tell which function to run. Name it %s(%s) (functions found: %s)" % (name, ", ".join(params), found))
    fname, _, method = sorted(pick, key=lambda d: d[2])[0]
    fn = getattr(_ns["Solution"](), fname) if method else _ns[fname]
    return fn, (None if fname == name else "Ran your %s as %s" % (fname, name))

class _TraceLimit(Exception):
    pass

def _scalar(v):
    if v is None or isinstance(v, (bool, int, str)):
        return v
    if isinstance(v, float):
        return v if math.isfinite(v) else str(v)
    s = repr(v)
    return s if len(s) <= 40 else s[:37] + "..."

class _Snapper:
    def __init__(self):
        self.ids = {}
        self.keep = []

    def node_id(self, o):
        k = id(o)
        if k not in self.ids:
            self.ids[k] = "n%d" % (len(self.ids) + 1)
            self.keep.append(o)
        return self.ids[k]

    def snap(self, v, depth=0):
        if v is None or isinstance(v, (bool, int, float, str)):
            return _scalar(v)
        if callable(v) or isinstance(v, type) or type(v).__name__ == "module":
            return _SKIP
        if depth > 3:
            return {"t": "ref"}
        if isinstance(v, (list, tuple, collections.deque)):
            items = list(v)
            out = [self.snap(x, depth + 1) for x in items[:60]]
            return {"t": "arr", "v": [None if x is _SKIP else x for x in out], "n": len(items)}
        if isinstance(v, dict):
            out = []
            for k, x in list(v.items())[:40]:
                s = self.snap(x, depth + 1)
                out.append([_scalar(k), None if s is _SKIP else s])
            return {"t": "map", "e": out}
        if isinstance(v, (set, frozenset)):
            return {"t": "set", "v": [_scalar(x) for x in list(v)[:60]]}
        if _is_list(v):
            nodes, seen, cur = [], set(), v
            while cur is not None and id(cur) not in seen and len(nodes) < 50 and _is_list(cur):
                seen.add(id(cur))
                nxt = getattr(cur, "next", None)
                nodes.append({"id": self.node_id(cur), "v": _scalar(_val(cur)), "next": self.node_id(nxt) if nxt is not None else None})
                cur = nxt
            return {"t": "list", "head": self.node_id(v), "nodes": nodes}
        if _is_tree(v):
            nodes, seen, queue = [], set(), [v]
            while queue and len(nodes) < 63:
                n = queue.pop(0)
                if n is None or id(n) in seen:
                    continue
                seen.add(id(n))
                l, r = getattr(n, "left", None), getattr(n, "right", None)
                nodes.append({"id": self.node_id(n), "v": _scalar(_val(n)), "l": self.node_id(l) if l is not None else None, "r": self.node_id(r) if r is not None else None})
                queue.append(l); queue.append(r)
            return {"t": "tree", "root": self.node_id(v), "nodes": nodes}
        if hasattr(v, "__dict__"):
            out = []
            for k, x in list(vars(v).items())[:40]:
                s = self.snap(x, depth + 1)
                if s is not _SKIP:
                    out.append([k, s])
            return {"t": "obj", "e": out}
        return _scalar(v)

_SKIP = object()

def _tracer(events):
    snapper = _Snapper()
    last = {}
    iters = {}

    def loop_of(line):
        best = None
        for L in _loops:
            if L["start"] <= line <= L["end"] and (best is None or L["start"] >= best["start"]):
                best = L
        return best

    def calls_of(frame):
        out = []
        f = frame
        while f is not None:
            if f.f_code.co_filename == _FILE and f.f_code.co_name != "<module>":
                code = f.f_code
                names = [n for n in code.co_varnames[:code.co_argcount] if n != "self"]
                args = ", ".join(str(_scalar(_val(f.f_locals[n]) if (_is_list(f.f_locals.get(n)) or _is_tree(f.f_locals.get(n))) else f.f_locals.get(n))) for n in names)
                out.append("%s(%s)" % (code.co_name, args))
            f = f.f_back
        out.reverse()
        return out

    def emit(frame, line, next_line):
        if len(events) >= _LIMIT:
            raise _TraceLimit()
        header = next((L for L in _loops if L["line"] == line - 1), None)
        if header is not None and next_line is not None and header["start"] <= next_line <= header["end"]:
            iters[header["id"]] = iters.get(header["id"], 0) + 1
            loop = header
        else:
            loop = loop_of(line)
        vars_ = {}
        for k, v in frame.f_locals.items():
            if k.startswith("__") or k == "self":
                continue
            s = snapper.snap(v)
            if s is not _SKIP:
                vars_[k] = s
        events.append({
            "auto": True, "line": line - 1, "loop": loop["id"] if loop else None,
            "iter": (iters.get(loop["id"], 1) - 1) if loop else None, "event": None,
            "vars": vars_, "calls": calls_of(frame),
        })

    def local(frame, event, arg):
        key = id(frame)
        if event == "line":
            prev = last.get(key)
            if prev is not None:
                emit(frame, prev, frame.f_lineno)
            last[key] = frame.f_lineno
        elif event == "return":
            prev = last.pop(key, None)
            if prev is not None:
                emit(frame, prev, None)
        return local

    def start(frame, event, arg):
        if event == "call" and frame.f_code.co_filename == _FILE:
            return local
        return None

    return start

def _run_case(call_json, case_json, trace):
    call = json.loads(call_json)
    raw = json.loads(case_json)
    events = [] if trace else None
    try:
        fn, note = _find(call["functionName"], [p["name"] for p in call["params"]])
        args = [_hin(p["type"], raw.get(p["name"])) for p in call["params"]]
        if trace:
            sys.settrace(_tracer(events))
        try:
            r = fn(*args)
        finally:
            sys.settrace(None)
        oi = call.get("outputIndex")
        v = args[oi] if oi is not None else r
        t = call["params"][oi]["type"] if oi is not None else call["returnType"]
        res = {"status": "ok", "actualJson": json.dumps(_hout(t, v), separators=(",", ":"))}
        if note:
            res["note"] = note
    except _NoEntry as e:
        res = {"status": "error", "error": str(e)}
    except _TraceLimit:
        res = {"status": "trace_limit", "error": "Stopped after %d steps: the run is too long to show step by step" % _LIMIT}
    except RecursionError as e:
        res = {"status": "error", "error": _err_text(e)}
    except BaseException as e:
        res = {"status": "error", "error": _err_text(e)}
    if trace:
        res["events"] = events
    return json.dumps(res, default=str)

def _loop_list():
    return json.dumps([{"id": L["id"], "line": L["line"]} for L in _loops])
`;

/**
 * The Python worker: loads Pyodide once, then runs each request's cases in turn. Kept alive between runs
 * so only the first run waits for the download; a case that hangs gets the worker terminated instead.
 */
export function pythonWorkerSource(): string {
  return `
importScripts(${JSON.stringify(`${PYODIDE_URL}pyodide.js`)});
var __out = [];
var __ready = (async function () {
  postMessage({ type: "loading" });
  var py = await loadPyodide({ indexURL: ${JSON.stringify(PYODIDE_URL)} });
  py.setStdout({ batched: function (s) { __out.push(s); } });
  py.setStderr({ batched: function (s) { __out.push(s); } });
  py.runPython(${JSON.stringify(PY_RUNNER)});
  return py;
})();
self.onmessage = async function (e) {
  var m = e.data, py;
  try {
    py = await __ready;
  } catch (err) {
    postMessage({ type: "fatal", error: "Couldn't load Python: " + (err && err.message ? err.message : String(err)) });
    return;
  }
  var load = py.globals.get("_load"), runCase = py.globals.get("_run_case"), loops = py.globals.get("_loop_list");
  __out = [];
  var failed = load(m.code);
  if (failed) {
    postMessage({ type: "fatal", error: failed });
    return;
  }
  for (var i = m.from; i < m.cases.length; i++) {
    postMessage({ type: "start", i: i });
    __out = [];
    var t0 = performance.now();
    var res = JSON.parse(runCase(JSON.stringify(m.call), JSON.stringify(m.cases[i]), m.trace));
    res.output = __out.join("\\n").slice(0, 10000);
    res.ms = Math.round(performance.now() - t0);
    postMessage({ type: "case", i: i, result: res });
  }
  postMessage({ type: "done", loops: JSON.parse(loops()) });
};
`;
}
