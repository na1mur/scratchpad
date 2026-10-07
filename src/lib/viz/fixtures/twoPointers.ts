import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { recorder } from "./builder";

// Two Sum II on a sorted array, with the pointer moves inverted.
const nums = [1, 3, 4, 6, 8, 11];
const target = 10;

export function twoPointersFixture(): VizSpec {
  const r = recorder();
  const arr = { kind: "array" as const, values: nums };
  const vars = (left: number, right: number, sum: number | null) => ({
    kind: "variables" as const,
    vars: { left, right, sum, target },
  });

  r.add({
    line: 0,
    title: "Place pointers at both ends",
    explanation: "left starts at index 0 and right at the last index, so the pair covers the smallest and largest values.",
    states: { nums: arr, vars: vars(0, 5, null) },
    pointers: [
      { structureId: "nums", name: "left", index: 0 },
      { structureId: "nums", name: "right", index: 5 },
    ],
    event: "init",
  });

  let left = 0;
  const right = 5;
  let iteration = 0;
  let bugId = "";
  while (left < right) {
    const sum = nums[left] + nums[right];
    const it = { loopId: "while", index: iteration };
    const ptrs = [
      { structureId: "nums", name: "left", index: left },
      { structureId: "nums", name: "right", index: right },
    ];
    r.add({
      line: 2,
      iteration: it,
      title: `Add nums[${left}] + nums[${right}]`,
      explanation: `${nums[left]} + ${nums[right]} = ${sum}, compared with the target ${target}.`,
      states: { nums: arr, vars: vars(left, right, sum) },
      pointers: ptrs,
      highlights: [{ structureId: "nums", targets: [left, right], tone: "compare" }],
      event: "compare",
    });
    const isFirst = iteration === 0;
    const id = r.add({
      line: 4,
      iteration: it,
      title: `${sum} > ${target}, so move left`,
      explanation: isFirst
        ? `The sum is too big, and your code responds by moving left forward. Since the array is sorted, nums[${left + 1}] ≥ nums[${left}], so this can only make the sum bigger or keep it the same.`
        : `Again the sum (${sum}) is too big and left moves forward, pushing the sum further away from ${target}.`,
      states: { nums: arr, vars: vars(left + 1, right, sum) },
      pointers: [
        { structureId: "nums", name: "left", index: left + 1 },
        { structureId: "nums", name: "right", index: right },
      ],
      highlights: [
        { structureId: "nums", targets: [left], tone: "visited" },
        { structureId: "nums", targets: [left + 1], tone: isFirst ? "error" : "active" },
      ],
      event: "update",
      isBugMoment: isFirst,
    });
    if (isFirst) bugId = id;
    left += 1;
    iteration += 1;
  }

  r.add({
    line: 6,
    title: "Pointers met: return []",
    explanation: "left reached right without ever finding the pair 4 + 6, so the function reports that no pair exists.",
    states: { nums: arr, vars: vars(left, right, null) },
    pointers: [
      { structureId: "nums", name: "left", index: left },
      { structureId: "nums", name: "right", index: right },
    ],
    highlights: [{ structureId: "nums", targets: [2, 3], tone: "success" }],
    event: "output",
  });

  return {
    version: 1,
    summary: {
      understoodApproach:
        "You're using two pointers from both ends of the sorted array, adjusting them based on whether the current sum is above or below the target.",
      verdict: "fails",
      testInputDescription: `nums = [${nums.join(", ")}], target = ${target}`,
      expectedOutput: "[2, 3]  (4 + 6 = 10)",
      actualOutput: "[]",
    },
    codeLines: [
      "left = 0, right = n - 1",
      "while left < right:",
      "    sum = nums[left] + nums[right]",
      "    if sum == target: return [left, right]",
      "    if sum > target: left += 1",
      "    else: right -= 1",
      "return []",
    ],
    structures: [
      { id: "nums", label: "nums", kind: "array" },
      { id: "vars", label: "Variables", kind: "variables" },
    ],
    loops: [{ id: "while", label: "while left < right", line: 1 }],
    steps: r.steps,
    diagnosis: {
      whatGoesWrong:
        "Every time the sum is too large, the code moves left forward, so the sum keeps growing and the pointers meet without ever trying 4 + 6.",
      whyItGoesWrong:
        "In a sorted array, moving left forward can only increase (or keep) nums[left]. When the sum is already too big, that step moves away from the target instead of toward it.",
      bugStepIds: [bugId],
      failingInputs: ["nums = [1, 3, 4, 6, 8, 11], target = 10", "nums = [2, 7, 11, 15], target = 9"],
      thinkingHints: [
        "When the sum is too big, which of the two values is responsible for making it big?",
        "In a sorted array, which direction does each pointer's value change when it moves inward?",
        "For each branch, ask: does this move make the sum smaller, larger, or either?",
      ],
      rethink: {
        scope: "fix-the-details",
        brokenAssumption:
          "Your loop assumes that moving either pointer inward gets you closer to the target. On [1, 3, 4, 6, 8, 11] with target 10, the first sum is 12, and moving left only pushes it higher.",
        shiftInThinking:
          "Instead of asking \"which pointer should I move?\", ask \"what do I need the sum to do next, and which move is guaranteed to do that?\"",
      },
    },
  };
}
