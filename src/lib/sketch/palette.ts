import { parseType, type HarnessView, type ValueType } from "@/lib/harness/types";
import { PALETTE_KINDS, type PaletteKind } from "./templates";

/**
 * Which palette items to put first for a problem, decided without a model call: the types in the harness
 * signature (what the function takes and returns), then the problem's tags. The rest stay under "More".
 */

function kindsForType(t: ValueType): PaletteKind[] {
  switch (t.kind) {
    case "int":
    case "double":
    case "bool":
    case "char":
    case "nodeIndex":
      return ["variables"];
    case "string":
      return ["string"];
    case "list":
      return ["linkedList"];
    case "tree":
      return ["tree"];
    case "void":
      return [];
    case "array":
      if (t.of.kind === "array") return ["matrix"];
      if (t.of.kind === "char") return ["string"];
      if (t.of.kind === "list") return ["linkedList"];
      if (t.of.kind === "tree") return ["tree"];
      return ["array"];
  }
}

const TAG_KINDS: Record<string, PaletteKind[]> = {
  Array: ["array"],
  String: ["string"],
  "Hash Map": ["hashmap"],
  "Two Pointers": ["array"],
  "Sliding Window": ["array", "hashmap"],
  "Binary Search": ["array"],
  Stack: ["stack"],
  Queue: ["queue"],
  "Linked List": ["linkedList"],
  Tree: ["tree"],
  BST: ["tree"],
  Heap: ["tree", "array"],
  Graph: ["graphNode"],
  BFS: ["queue"],
  DFS: ["stack"],
  Recursion: ["stack"],
  Backtracking: ["array"],
  "Dynamic Programming": ["array", "matrix"],
  Greedy: ["array"],
  Sorting: ["array"],
  "Bit Manipulation": ["variables"],
  Math: ["variables"],
  Matrix: ["matrix"],
  Trie: ["tree"],
  "Union Find": ["graphNode", "array"],
  Intervals: ["array"],
};

export function suggestedKinds(harness: HarnessView, tags: readonly string[]): PaletteKind[] {
  const out = new Set<PaletteKind>();
  if (harness.status === "ready") {
    const types = [...harness.params.filter((p) => p.name !== harness.cycle?.pos).map((p) => p.type), harness.returnType];
    for (const name of types) {
      const t = parseType(name);
      if (t) for (const k of kindsForType(t)) out.add(k);
    }
  }
  for (const tag of tags) for (const k of TAG_KINDS[tag] ?? []) out.add(k);
  if (!out.size) for (const k of ["array", "hashmap", "variables"] as const) out.add(k);
  // Single nodes aren't items of their own: they're parts of the list, tree and graph items (parts.ts).
  // Keep the palette's own order, so items don't jump around between problems.
  return PALETTE_KINDS.filter((k) => out.has(k));
}
