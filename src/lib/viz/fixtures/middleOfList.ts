import type { Step, TestCase, VizSpec } from "@/lib/ai/schemas/vizSpec";

// Middle of a linked list (second middle for even lengths), with a loop condition that stops one step
// early on even lengths. Three cases, so the case picker has something to pick from.
const codeLines = [
  "slow = head, fast = head",
  "while fast.next and fast.next.next:",
  "    slow = slow.next",
  "    fast = fast.next.next",
  "return slow",
];
const structures: TestCase["structures"] = [
  { id: "list", label: "list", kind: "linkedList" },
  { id: "vars", label: "Variables", kind: "variables" },
];
const loops: TestCase["loops"] = [{ id: "while", label: "while fast.next and fast.next.next", line: 1 }];

function runCase(caseId: string, values: number[]): { steps: Step[]; result: number } {
  const ids = values.map((_, i) => `n${i}`);
  const list = {
    kind: "linkedList" as const,
    nodes: values.map((value, i) => ({ id: ids[i], value, next: ids[i + 1] ?? null })),
    headId: ids[0],
  };
  const steps: Step[] = [];
  const add = (step: Omit<Step, "id" | "states">, slow: number, fast: number) =>
    steps.push({
      id: `${caseId}-s${steps.length + 1}`,
      ...step,
      states: { list, vars: { kind: "variables", vars: { slow: values[slow], fast: values[fast] } } },
      pointers: [
        { structureId: "list", name: "slow", index: ids[slow] },
        { structureId: "list", name: "fast", index: ids[fast] },
      ],
    });

  let slow = 0;
  let fast = 0;
  add(
    { line: 0, title: "Both pointers start at the head", explanation: "slow will move one node per round and fast two.", event: "init" },
    slow,
    fast,
  );
  let round = 0;
  while (fast + 2 < values.length) {
    slow += 1;
    fast += 2;
    add(
      {
        line: 3,
        iteration: { loopId: "while", index: round++ },
        title: `slow moves to ${values[slow]}, fast to ${values[fast]}`,
        explanation: `fast has two nodes ahead of it, so both pointers advance.`,
        event: "update",
        highlights: [{ structureId: "list", targets: [ids[slow]], tone: "active" }],
      },
      slow,
      fast,
    );
  }
  const even = values.length % 2 === 0;
  add(
    {
      line: 1,
      title: even ? "fast.next.next is missing: stop" : "fast is on the last node: stop",
      explanation: even
        ? `fast sits on ${values[fast]} with one node left after it, so the loop ends before slow reaches the second middle.`
        : `No nodes are left after fast, so slow is on the middle.`,
      event: "compare",
      isBugMoment: even || undefined,
      highlights: [{ structureId: "list", targets: [ids[fast]], tone: even ? "error" : "compare" }],
    },
    slow,
    fast,
  );
  add(
    {
      line: 4,
      title: `Return ${values[slow]}`,
      explanation: `slow is on ${values[slow]}.`,
      event: "return",
      highlights: [{ structureId: "list", targets: [ids[slow]], tone: even ? "error" : "success" }],
    },
    slow,
    fast,
  );
  return { steps, result: values[slow] };
}

export function middleOfListFixture(): VizSpec {
  const inputs = [
    { id: "c1", label: "Even length", values: [1, 2, 3, 4], expected: 3 },
    { id: "c2", label: "Odd length", values: [1, 2, 3, 4, 5], expected: 3 },
    { id: "c3", label: "Single node", values: [7], expected: 7 },
  ];
  const cases = inputs.map((c): TestCase => {
    const { steps, result } = runCase(c.id, c.values);
    return {
      id: c.id,
      label: c.label,
      input: `head = [${c.values.join(", ")}]`,
      expectedOutput: String(c.expected),
      actualOutput: String(result),
      passed: result === c.expected,
      structures,
      loops,
      steps,
    };
  });
  const bug = cases[0].steps.find((s) => s.isBugMoment);
  return {
    version: 2,
    summary: {
      understoodApproach:
        "You're moving a slow pointer one node and a fast pointer two nodes at a time, so slow is in the middle when fast runs out of list.",
      verdict: "partially_works",
    },
    codeLines,
    cases,
    diagnosis: {
      whatGoesWrong: "On the even-length list [1, 2, 3, 4] it returns 2, but the problem asks for the second middle, 3.",
      whyItGoesWrong: "The loop stops while fast still has one node after it, which only happens on even lengths.",
      bugStepIds: bug ? [bug.id] : [],
      thinkingHints: [
        "Where is fast when the loop ends on an even-length list, compared with an odd one?",
        "Which part of the loop condition decides that?",
      ],
      rethink: {
        scope: "fix-the-details",
        brokenAssumption:
          "Your condition assumes fast always needs two more nodes to move, but on [1, 2, 3, 4] that leaves slow one short of the second middle.",
        shiftInThinking: "What should be true about fast at the moment slow sits on the node you want to return?",
      },
    },
  };
}
