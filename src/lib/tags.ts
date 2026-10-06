// Auto-tagging may only choose from this list.
export const TAGS = [
  "Array",
  "String",
  "Hash Map",
  "Two Pointers",
  "Sliding Window",
  "Binary Search",
  "Stack",
  "Queue",
  "Linked List",
  "Tree",
  "BST",
  "Heap",
  "Graph",
  "BFS",
  "DFS",
  "Recursion",
  "Backtracking",
  "Dynamic Programming",
  "Greedy",
  "Sorting",
  "Bit Manipulation",
  "Math",
  "Matrix",
  "Trie",
  "Union Find",
  "Intervals",
] as const;

export type Tag = (typeof TAGS)[number];

export const TAG_SET: ReadonlySet<string> = new Set(TAGS);

/** Keeps only known tags, in canonical order, without duplicates. */
export function normalizeTags(tags: readonly string[]): Tag[] {
  const wanted = new Set(tags.map((t) => t.trim().toLowerCase()));
  return TAGS.filter((t) => wanted.has(t.toLowerCase()));
}
