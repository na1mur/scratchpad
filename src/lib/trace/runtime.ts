/** Most steps one run may record; past it the run stops as `trace_limit`. */
export const AUTO_TRACE_LIMIT = 1500;

/**
 * Defines what instrumentJs() inserts. Each step lands in `__events` as
 * { auto: true, line, loop, iter, event, vars, calls }, with every variable snapshotted into a tagged
 * JSON form (see Snap in steps.ts) so lists and trees keep node identity. Plain ES5, evaluated before the
 * program in QuickJS or in a browser worker.
 */
export const AUTO_TRACE_RUNTIME = String.raw`
var __events = typeof __events !== "undefined" ? __events : [];
var __aIters = {}, __aCalls = [], __aIds = new WeakMap(), __aIdc = 0;
function __aId(o) {
  var v = __aIds.get(o);
  if (!v) { v = "n" + (++__aIdc); __aIds.set(o, v); }
  return v;
}
function __aVal(n) { return n.val !== undefined ? n.val : n.value !== undefined ? n.value : n.data !== undefined ? n.data : null; }
function __aIsList(v) { return "next" in v && !("left" in v) && !("right" in v); }
function __aIsTree(v) { return "left" in v || "right" in v || (Array.isArray(v.children) && ("val" in v || "value" in v)); }
function __aScalar(v) {
  if (v === null || v === undefined) return null;
  var t = typeof v;
  if (t === "number") return isFinite(v) ? v : String(v);
  if (t === "string" || t === "boolean") return v;
  if (t === "bigint") return Number(v);
  try { var s = JSON.stringify(v); return s && s.length > 40 ? s.slice(0, 37) + "..." : s; } catch (e) { return String(v); }
}
function __aSnap(v, depth) {
  if (v === null) return null;
  var t = typeof v;
  if (t === "undefined" || t === "function" || t === "symbol") return undefined;
  if (t !== "object") return __aScalar(v);
  if (depth > 3) return { t: "ref" };
  var i, out;
  if (Array.isArray(v)) {
    out = [];
    for (i = 0; i < v.length && i < 60; i++) { var x = __aSnap(v[i], depth + 1); out.push(x === undefined ? null : x); }
    return { t: "arr", v: out, n: v.length };
  }
  if (v instanceof Map) {
    out = [];
    v.forEach(function (x, k) { if (out.length < 40) out.push([__aScalar(k), __aSnap(x, depth + 1)]); });
    return { t: "map", e: out };
  }
  if (v instanceof Set) {
    out = [];
    v.forEach(function (x) { if (out.length < 60) out.push(__aScalar(x)); });
    return { t: "set", v: out };
  }
  if (__aIsList(v)) {
    var nodes = [], seen = new Set(), cur = v;
    while (cur && typeof cur === "object" && !seen.has(cur) && nodes.length < 50) {
      seen.add(cur);
      nodes.push({ id: __aId(cur), v: __aScalar(__aVal(cur)), next: cur.next && typeof cur.next === "object" ? __aId(cur.next) : null });
      cur = cur.next;
    }
    return { t: "list", head: __aId(v), nodes: nodes };
  }
  if (__aIsTree(v)) {
    var tn = [], tseen = new Set(), queue = [v];
    while (queue.length && tn.length < 63) {
      var n = queue.shift();
      if (!n || typeof n !== "object" || tseen.has(n)) continue;
      tseen.add(n);
      var e = { id: __aId(n), v: __aScalar(__aVal(n)) };
      if (Array.isArray(n.children)) {
        e.c = n.children.filter(Boolean).map(__aId);
        n.children.forEach(function (c) { if (c) queue.push(c); });
      } else {
        e.l = n.left ? __aId(n.left) : null;
        e.r = n.right ? __aId(n.right) : null;
        if (n.left) queue.push(n.left);
        if (n.right) queue.push(n.right);
      }
      tn.push(e);
    }
    return { t: "tree", root: __aId(v), nodes: tn };
  }
  out = [];
  for (var k in v) {
    if (out.length >= 40) break;
    var s = __aSnap(v[k], depth + 1);
    if (s !== undefined) out.push([k, s]);
  }
  return { t: "obj", e: out };
}
function __step(line, loop, event, read) {
  if (__events.length >= ${AUTO_TRACE_LIMIT}) throw new Error("__TRACE_LIMIT__");
  var raw = read(), vars = {};
  for (var k in raw) { var s = __aSnap(raw[k], 0); if (s !== undefined) vars[k] = s; }
  __events.push({ auto: true, line: line, loop: loop, iter: loop ? (__aIters[loop] || 1) - 1 : null, event: event, vars: vars, calls: __aCalls.slice() });
}
function __iter(loop, line, read) {
  __aIters[loop] = (__aIters[loop] || 0) + 1;
  __step(line, loop, null, read);
}
function __enter(name, args) {
  __aCalls.push(name + "(" + args.map(function (a) { var s = __aScalar(a && typeof a === "object" ? (__aIsList(a) || __aIsTree(a) ? __aVal(a) : a) : a); return s === null ? "null" : String(s); }).join(", ") + ")");
  if (__aCalls.length > 2000) throw new RangeError("Maximum call stack size exceeded");
}
function __exit() { __aCalls.pop(); }
/** Between cases run in one worker: a fresh trace, iteration counts and call stack. */
function __resetTrace() { __events.length = 0; __aIters = {}; __aCalls = []; }
`;
