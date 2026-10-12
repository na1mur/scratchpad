/**
 * The hidden support code a solution runs with: LeetCode's ListNode and TreeNode, and converters between
 * them and the harness's JSON values. Plain ES5 source, evaluated before the learner's or the reference's
 * code, in QuickJS on the server and in a Web Worker in the browser. Types are ValueType objects
 * (src/lib/harness/types.ts).
 *
 * ListNode and TreeNode are assigned to globalThis rather than declared, so code that declares its own
 * (`class ListNode {…}`) replaces them instead of failing with a redeclaration error.
 */
export const HARNESS_RUNTIME = String.raw`
globalThis.ListNode = function ListNode(val, next) {
  this.val = val === undefined ? 0 : val;
  this.next = next === undefined ? null : next;
};
globalThis.TreeNode = function TreeNode(val, left, right) {
  this.val = val === undefined ? 0 : val;
  this.left = left === undefined ? null : left;
  this.right = right === undefined ? null : right;
};
var __H_LIMIT = 2000;
function __hToList(a) {
  var head = null;
  for (var i = a.length - 1; i >= 0; i--) head = new ListNode(a[i], head);
  return head;
}
function __hToTree(a) {
  if (!a.length || a[0] === null) return null;
  var root = new TreeNode(a[0]), queue = [root], i = 1;
  while (queue.length && i < a.length) {
    var n = queue.shift();
    if (i < a.length && a[i] !== null) { n.left = new TreeNode(a[i]); queue.push(n.left); }
    i++;
    if (i < a.length && a[i] !== null) { n.right = new TreeNode(a[i]); queue.push(n.right); }
    i++;
  }
  return root;
}
// Code that builds its own nodes may call the value something else.
function __hVal(n) { return n.val !== undefined ? n.val : n.value !== undefined ? n.value : n.data !== undefined ? n.data : null; }
function __hFromList(head) {
  var out = [];
  while (head && typeof head === "object" && out.length < __H_LIMIT) { out.push(__hVal(head)); head = head.next; }
  return out;
}
function __hFromTree(root) {
  if (!root || typeof root !== "object") return [];
  var out = [], queue = [root];
  while (queue.length && out.length < __H_LIMIT) {
    var n = queue.shift();
    if (!n) { out.push(null); continue; }
    out.push(__hVal(n));
    queue.push(n.left || null);
    queue.push(n.right || null);
  }
  while (out.length && out[out.length - 1] === null) out.pop();
  return out;
}
/** JSON value -> what the function takes. */
function __hIn(t, v) {
  if (v === null || v === undefined) return null;
  switch (t.kind) {
    case "list": return __hToList(v);
    case "tree": return __hToTree(v);
    case "array": return v.map(function (x) { return __hIn(t.of, x); });
    default: return v;
  }
}
/** What the function returned -> JSON value. */
function __hOut(t, v) {
  if (v === undefined) return null;
  if (v === null) return t.kind === "list" || t.kind === "tree" ? [] : null;
  switch (t.kind) {
    case "list": return __hFromList(v);
    case "tree": return __hFromTree(v);
    case "array":
      if (typeof v === "string") v = v.split("");
      else if (!Array.isArray(v) && typeof v === "object" && typeof v[Symbol.iterator] === "function") v = Array.from(v);
      return Array.isArray(v) ? v.map(function (x) { return __hOut(t.of, x); }) : __hPlain(v);
    case "bool": return typeof v === "number" ? v !== 0 : v;
    default: return __hPlain(v);
  }
}
/** A value of unknown shape -> JSON (Maps become objects, Sets arrays, nodes their arrays). */
function __hPlain(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === "bigint") return Number(v);
  if (typeof v !== "object") return v;
  if (v instanceof Map) { var o = {}; v.forEach(function (x, k) { o[String(k)] = __hPlain(x); }); return o; }
  if (v instanceof Set) return Array.from(v).map(__hPlain);
  if (Array.isArray(v)) return v.map(__hPlain);
  if ("next" in v && !("left" in v)) return __hFromList(v);
  if ("left" in v || "right" in v) return __hFromTree(v);
  var out = {};
  for (var k in v) out[k] = __hPlain(v[k]);
  return out;
}
`;
