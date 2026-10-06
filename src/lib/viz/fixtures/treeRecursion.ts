import type { StructureState, VizSpec } from "@/lib/ai/schemas/vizSpec";
import { recorder } from "./builder";

// minDepth that takes min() over a missing child, which counts as depth 0.
type Node = { id: string; value: number; left: string | null; right: string | null };
const nodes: Node[] = [
  { id: "n1", value: 1, left: null, right: "n2" },
  { id: "n2", value: 2, left: "n3", right: "n4" },
  { id: "n3", value: 3, left: null, right: null },
  { id: "n4", value: 4, left: null, right: null },
];
const byId = new Map(nodes.map((n) => [n.id, n]));
const tree: StructureState = { kind: "tree", rootId: "n1", nodes };

export function treeRecursionFixture(): VizSpec {
  const r = recorder();
  const stack: string[] = [];
  const done = new Set<string>();
  const results = new Map<string, number>();
  let bugId = "";

  const snapshot = (vars: Record<string, string | number | null>) => ({
    tree,
    calls: { kind: "stack" as const, items: [...stack] },
    vars: { kind: "variables" as const, vars },
  });
  const tones = (current: string | null, tone: "active" | "error" | "success" = "active") => [
    { structureId: "tree", targets: [...done], tone: "visited" as const },
    ...(current ? [{ structureId: "tree", targets: [current], tone }] : []),
    { structureId: "calls", targets: [stack.length - 1], tone: "active" as const },
  ];

  function minDepth(id: string | null, depth: number): number {
    const label = id ? `minDepth(${byId.get(id)!.value})` : "minDepth(None)";
    stack.push(label);
    if (!id) {
      r.add({
        line: 1,
        title: "Reached a missing child: return 0",
        explanation: "The base case treats an empty subtree as depth 0.",
        states: snapshot({ node: "None", left: null, right: null, returns: 0 }),
        highlights: tones(null),
        event: "return",
      });
      stack.pop();
      return 0;
    }
    const node = byId.get(id)!;
    r.add({
      line: 2,
      title: `Call minDepth(${node.value})`,
      explanation: depth === 0 ? "Start at the root." : `Recurse into node ${node.value}; a new frame goes on the call stack.`,
      states: snapshot({ node: node.value, left: null, right: null, returns: null }),
      highlights: tones(id),
      event: "recurse",
    });
    const left = minDepth(node.left, depth + 1);
    const right = minDepth(node.right, depth + 1);
    const result = 1 + Math.min(left, right);
    const isBug = node.left === null !== (node.right === null) && Math.min(left, right) === 0;
    const stepId = r.add({
      line: 4,
      title: `Node ${node.value} returns 1 + min(${left}, ${right}) = ${result}`,
      explanation: isBug
        ? `Node ${node.value} has only one child. The missing side reports 0, and min() picks it, so this path is treated as if the tree ended right here, even though node ${node.value} isn't a leaf.`
        : `Both children reported their depths, and node ${node.value} adds itself on top of the smaller one.`,
      states: snapshot({ node: node.value, left, right, returns: result }),
      highlights: tones(id, isBug ? "error" : "success"),
      event: "return",
      isBugMoment: isBug,
    });
    if (isBug && !bugId) bugId = stepId;
    done.add(id);
    results.set(id, result);
    stack.pop();
    return result;
  }

  const answer = minDepth("n1", 0);

  return {
    version: 1,
    summary: {
      understoodApproach:
        "You're computing the minimum depth recursively: each node asks both children for their minimum depth and adds one to the smaller.",
      verdict: "fails",
      testInputDescription: "Tree: 1 → right 2; 2 → left 3, right 4",
      expectedOutput: "3  (1 → 2 → 3)",
      actualOutput: String(answer),
    },
    codeLines: [
      "def minDepth(node):",
      "    if node is None: return 0",
      "    left = minDepth(node.left)",
      "    right = minDepth(node.right)",
      "    return 1 + min(left, right)",
    ],
    structures: [
      { id: "tree", label: "tree", kind: "tree" },
      { id: "calls", label: "Call stack", kind: "stack" },
      { id: "vars", label: "Current frame", kind: "variables" },
    ],
    loops: [],
    steps: r.steps,
    diagnosis: {
      whatGoesWrong: "The root has no left child, and that empty side wins the min(), so the answer is 1 instead of 3.",
      whyItGoesWrong:
        "Minimum depth is measured to a leaf. A missing child isn't a leaf, but returning 0 for it lets min() treat it like the shortest possible path.",
      bugStepIds: bugId ? [bugId] : [],
      failingInputs: ["Any root with exactly one child, e.g. 1 → 2"],
      thinkingHints: [
        "What exactly counts as the end of a root-to-leaf path?",
        "When a node has only one child, which of its two recursive answers actually describes a real path?",
        "Try your function by hand on a two-node tree. Is the answer 1 or 2?",
      ],
    },
  };
}
