import type { VizSpec, VizSpecV1 } from "@/lib/ai/schemas/vizSpec";
import { bfsGraphFixture } from "./bfsGraph";
import { middleOfListFixture } from "./middleOfList";
import { slidingWindowFixture } from "./slidingWindow";
import { treeRecursionFixture } from "./treeRecursion";
import { twoPointersFixture } from "./twoPointers";

export const FIXTURES: { id: string; label: string; build: () => VizSpec | VizSpecV1 }[] = [
  { id: "two-pointers", label: "Two pointers (array)", build: twoPointersFixture },
  { id: "bfs", label: "BFS (graph)", build: bfsGraphFixture },
  { id: "tree-recursion", label: "Recursion (tree)", build: treeRecursionFixture },
  { id: "sliding-window", label: "Sliding window (hashmap)", build: slidingWindowFixture },
  { id: "middle-of-list", label: "Several test cases (linked list)", build: middleOfListFixture },
];
