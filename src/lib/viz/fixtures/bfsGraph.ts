import type { StructureState, VizSpec } from "@/lib/ai/schemas/vizSpec";
import { recorder } from "./builder";

// BFS that marks nodes visited when dequeued instead of when enqueued.
const adjacency: Record<string, string[]> = {
  A: ["B", "C"],
  B: ["A", "D"],
  C: ["A", "D"],
  D: ["B", "C", "E"],
  E: ["D"],
};

const graph: StructureState = {
  kind: "graph",
  directed: false,
  nodes: Object.keys(adjacency).map((id) => ({ id, label: id })),
  edges: [
    { from: "A", to: "B" },
    { from: "A", to: "C" },
    { from: "B", to: "D" },
    { from: "C", to: "D" },
    { from: "D", to: "E" },
  ],
};

export function bfsGraphFixture(): VizSpec {
  const r = recorder();
  const queue: string[] = ["A"];
  const visited: string[] = [];
  const order: string[] = [];

  const snapshot = (node: string | null, nb: string | null) => ({
    graph,
    queue: { kind: "queue" as const, items: [...queue] },
    visited: { kind: "set" as const, values: [...visited] },
    vars: { kind: "variables" as const, vars: { node, nb, order: order.join(" → ") || "—" } },
  });

  r.add({
    line: 0,
    title: "Start with A in the queue",
    explanation: "The queue holds nodes waiting to be processed. Nothing is visited yet.",
    states: snapshot(null, null),
    highlights: [{ structureId: "graph", targets: ["A"], tone: "active" }],
    event: "init",
  });

  let iteration = 0;
  let bugId = "";
  const duplicatePops: string[] = [];
  while (queue.length > 0) {
    const it = { loopId: "while", index: iteration };
    const node = queue.shift()!;
    const again = visited.includes(node);
    if (!again) visited.push(node);
    order.push(node);
    const id = r.add({
      line: 3,
      iteration: it,
      title: again ? `Pop ${node} again` : `Pop ${node} and mark it visited`,
      explanation: again
        ? `${node} was already processed, but a second copy was waiting in the queue, so it is processed twice.`
        : `${node} leaves the front of the queue and is only now added to visited.`,
      states: snapshot(node, null),
      highlights: [
        { structureId: "graph", targets: visited.filter((v) => v !== node), tone: "visited" },
        { structureId: "graph", targets: [node], tone: again ? "error" : "active" },
      ],
      event: again ? "visit" : "pop",
      isBugMoment: again && duplicatePops.length === 0,
    });
    if (again) duplicatePops.push(id);

    for (const nb of adjacency[node]) {
      if (visited.includes(nb)) continue;
      const alreadyQueued = queue.includes(nb);
      queue.push(nb);
      const pushId = r.add({
        line: 7,
        iteration: it,
        title: `Push ${nb}${alreadyQueued ? " (already queued!)" : ""}`,
        explanation: alreadyQueued
          ? `${nb} isn't in visited yet because it hasn't been popped, so the check on the line above lets a second copy into the queue.`
          : `${nb} is a neighbor of ${node} that isn't in visited, so it joins the back of the queue.`,
        states: snapshot(node, nb),
        highlights: [
          { structureId: "graph", targets: visited, tone: "visited" },
          { structureId: "graph", targets: [node], tone: "active" },
          { structureId: "graph", targets: [nb], tone: alreadyQueued ? "error" : "compare" },
          { structureId: "queue", targets: [queue.length - 1], tone: alreadyQueued ? "error" : "active" },
        ],
        event: "push",
        isBugMoment: alreadyQueued && !bugId,
      });
      if (alreadyQueued && !bugId) bugId = pushId;
    }
    iteration += 1;
  }

  r.add({
    line: 8,
    title: "Queue empty: done",
    explanation: `Visit order was ${order.join(" → ")}. D and E were processed twice.`,
    states: snapshot(null, null),
    highlights: [{ structureId: "graph", targets: visited, tone: "success" }],
    event: "output",
  });

  return {
    version: 1,
    summary: {
      understoodApproach:
        "You're doing a breadth-first traversal from A with a queue, skipping neighbors that have already been visited.",
      verdict: "partially_works",
      testInputDescription: "Undirected graph A–B, A–C, B–D, C–D, D–E, starting at A",
      expectedOutput: "A → B → C → D → E (each node once)",
      actualOutput: order.join(" → "),
    },
    codeLines: [
      "queue = [start]",
      "visited = {}",
      "while queue not empty:",
      "    node = queue.pop_front()",
      "    visited.add(node)",
      "    for nb in graph[node]:",
      "        if nb not in visited:",
      "            queue.push(nb)",
      "return order",
    ],
    structures: [
      { id: "graph", label: "graph", kind: "graph" },
      { id: "queue", label: "queue", kind: "queue" },
      { id: "visited", label: "visited", kind: "set" },
      { id: "vars", label: "Variables", kind: "variables" },
    ],
    loops: [{ id: "while", label: "while queue", line: 2 }],
    steps: r.steps,
    diagnosis: {
      whatGoesWrong:
        "Nodes reachable along two paths (D, then E) enter the queue more than once and get processed more than once.",
      whyItGoesWrong:
        "A node only counts as visited once it is popped. Between being pushed and being popped, the visited check can't see it, so another neighbor pushes it again.",
      bugStepIds: [bugId, ...duplicatePops.slice(0, 1)],
      failingInputs: ["A diamond shape: A–B, A–C, B–D, C–D", "A complete graph on 5 nodes"],
      thinkingHints: [
        "Count how many times each node enters the queue. Is that what you intended?",
        "What does 'visited' mean in your code: processed, or discovered? Which one does the check need?",
        "Watch the moment D is pushed the second time: what does the visited set contain right then?",
      ],
    },
  };
}
