import type { Node } from "acorn";
import { parseType, type HarnessParam, type ValueType } from "@/lib/harness/types";
import type { RunLanguage } from "./protocol";

/** A function the learner defined: top level, or a method of a LeetCode-style Solution class. */
export type Definition = { name: string; arity: number; method: boolean };

const norm = (s: string) => s.replace(/_/g, "").toLowerCase();

/**
 * Which of the learner's functions to call for the signature's `name`: that name, the same name in another
 * case style (remove_duplicates for removeDuplicates), the only function taking that many parameters, or
 * the only function there is. `note` says so when it isn't the signature's name. The Python runner's
 * `_find` follows the same rules.
 */
export function resolveEntry(
  defs: Definition[],
  name: string,
  params: string[],
): { entry: Definition; note: string | null } | { error: string } {
  let pick = defs.filter((d) => d.name === name);
  if (!pick.length) pick = defs.filter((d) => norm(d.name) === norm(name));
  if (!pick.length) {
    const same = defs.filter((d) => d.arity === params.length);
    pick = same.length === 1 ? same : defs.length === 1 ? defs : [];
  }
  if (!pick.length) {
    const found = defs.map((d) => d.name).join(", ") || "none";
    return { error: `Couldn't tell which function to run. Name it ${name}(${params.join(", ")}) (functions found: ${found})` };
  }
  const entry = [...pick].sort((a, b) => Number(a.method) - Number(b.method))[0];
  return { entry, note: entry.name === name ? null : `Ran your ${entry.name} as ${name}` };
}

type AnyNode = Node & Record<string, unknown>;

/** Top-level functions (declared, or assigned to a variable) and Solution's methods, from a parsed program. */
export function jsDefinitions(ast: Node): Definition[] {
  const defs: Definition[] = [];
  const isFn = (n: unknown): n is AnyNode =>
    Boolean(n && typeof n === "object" && ["FunctionExpression", "ArrowFunctionExpression"].includes((n as Node).type));
  for (const s of (ast as AnyNode).body as AnyNode[]) {
    if (s.type === "FunctionDeclaration" && s.id) {
      defs.push({ name: (s.id as AnyNode).name as string, arity: (s.params as unknown[]).length, method: false });
    } else if (s.type === "VariableDeclaration") {
      for (const d of s.declarations as AnyNode[]) {
        if ((d.id as AnyNode).type === "Identifier" && isFn(d.init)) {
          defs.push({ name: (d.id as AnyNode).name as string, arity: (d.init.params as unknown[]).length, method: false });
        }
      }
    } else if (s.type === "ClassDeclaration" && (s.id as AnyNode | null)?.name === "Solution") {
      for (const m of ((s.body as AnyNode).body as AnyNode[]) ?? []) {
        const key = m.key as AnyNode | undefined;
        if (m.type === "MethodDefinition" && m.kind === "method" && key?.type === "Identifier" && !(key.name as string).startsWith("_")) {
          defs.push({ name: key.name as string, arity: ((m.value as AnyNode).params as unknown[]).length, method: true });
        }
      }
    }
  }
  return defs;
}

function kinds(t: ValueType, out: Set<string>) {
  out.add(t.kind);
  if (t.kind === "array") kinds(t.of, out);
}

function typeName(language: RunLanguage, t: ValueType): string {
  const py = language === "python";
  switch (t.kind) {
    case "int":
      return py ? "int" : "number";
    case "double":
      return py ? "float" : "number";
    case "bool":
      return py ? "bool" : "boolean";
    case "string":
    case "char":
      return py ? "str" : "string";
    case "list":
      return py ? "Optional[ListNode]" : "ListNode | null";
    case "tree":
      return py ? "Optional[TreeNode]" : "TreeNode | null";
    case "void":
      return py ? "None" : "void";
    case "array": {
      const inner = typeName(language, t.of);
      return py ? `List[${inner}]` : inner.includes("|") ? `(${inner})[]` : `${inner}[]`;
    }
  }
}

const PROVIDED: Record<RunLanguage, { list: string; tree: string; note: string }> = {
  python: {
    list: `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val    # node.value and node.data work too
        self.next = next`,
    tree: `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val    # node.value and node.data work too
        self.left = left
        self.right = right`,
    note: `# Already imported, as on LeetCode: typing (List, Optional…), collections
# (deque, defaultdict, Counter), heapq, bisect, functools, itertools, math.`,
  },
  javascript: {
    list: `function ListNode(val, next) {
  this.val = val === undefined ? 0 : val;  // node.value and node.data work too
  this.next = next === undefined ? null : next;
}`,
    tree: `function TreeNode(val, left, right) {
  this.val = val === undefined ? 0 : val;  // node.value and node.data work too
  this.left = left === undefined ? null : left;
  this.right = right === undefined ? null : right;
}`,
    note: "",
  },
  typescript: {
    list: `class ListNode {
  val: number;  // node.value and node.data work too
  next: ListNode | null;
  constructor(val?: number, next?: ListNode | null) {}
}`,
    tree: `class TreeNode {
  val: number;  // node.value and node.data work too
  left: TreeNode | null;
  right: TreeNode | null;
  constructor(val?: number, left?: TreeNode | null, right?: TreeNode | null) {}
}`,
    note: "",
  },
};

/**
 * What the hidden runtime provides, as the learner would write it: the function the tests call and the
 * node classes its types use. Shown above the editor so nothing about the run is a surprise.
 */
export function providedCode(
  language: RunLanguage,
  sig: { functionName: string; params: HarnessParam[]; returnType: string; outputParam?: string },
): { signature: string; definitions: string } {
  const params = sig.params.map((p) => ({ name: p.name, type: parseType(p.type) }));
  const ret = parseType(sig.returnType);
  const used = new Set<string>();
  for (const t of [...params.map((p) => p.type), ret]) if (t) kinds(t, used);
  const typed = (p: { name: string; type: ValueType | null }) =>
    language === "javascript" || !p.type ? p.name : `${p.name}: ${typeName(language, p.type)}`;
  const args = params.map(typed).join(", ");
  const retName = ret ? typeName(language, ret) : "";
  const inPlace = sig.outputParam ? `  # changes ${sig.outputParam} in place; that's the answer` : "";
  const signature =
    language === "python"
      ? `def ${sig.functionName}(${args}) -> ${retName}:${inPlace}`
      : language === "typescript"
        ? `function ${sig.functionName}(${args}): ${retName}${inPlace.replace("#", "//")}`
        : `function ${sig.functionName}(${args})${inPlace.replace("#", "//")}`;
  const p = PROVIDED[language];
  const definitions = [p.note, used.has("list") && p.list, used.has("tree") && p.tree].filter(Boolean).join("\n\n");
  return { signature, definitions };
}
