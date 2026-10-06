import type { VizSpec } from "@/lib/ai/schemas/vizSpec";
import { recorder } from "./builder";

// Longest substring without repeating characters, where `left` can jump
// backwards because it isn't clamped.
const s = "abba";

export function slidingWindowFixture(): VizSpec {
  const r = recorder();
  const last = new Map<string, number>();
  let left = 0;
  let best = 0;
  let bugId = "";
  const chars = s.split("");

  const snapshot = (right: number | null, c: string | null) => ({
    s: { kind: "string" as const, values: chars },
    last: { kind: "hashmap" as const, entries: [...last.entries()] },
    vars: { kind: "variables" as const, vars: { left, right, c, best } },
  });
  const windowTargets = (right: number) =>
    right >= left ? Array.from({ length: right - left + 1 }, (_, k) => left + k) : [];

  r.add({
    line: 1,
    title: "Empty window",
    explanation: "last remembers the most recent index of each character. The window starts empty at index 0.",
    states: snapshot(null, null),
    pointers: [{ structureId: "s", name: "left", index: 0 }],
    event: "init",
  });

  for (let right = 0; right < s.length; right++) {
    const it = { loopId: "for", index: right };
    const c = s[right];
    const ptrs = () => [
      { structureId: "s", name: "left", index: left },
      { structureId: "s", name: "right", index: right },
    ];
    r.add({
      line: 3,
      iteration: it,
      title: `Read s[${right}] = '${c}'`,
      explanation: last.has(c)
        ? `'${c}' was seen before at index ${last.get(c)}.`
        : `'${c}' hasn't been seen yet.`,
      states: snapshot(right, c),
      pointers: ptrs(),
      highlights: [
        { structureId: "s", targets: windowTargets(right - 1), tone: "active" },
        { structureId: "s", targets: [right], tone: "compare" },
        ...(last.has(c) ? [{ structureId: "last", targets: [c], tone: "compare" as const }] : []),
      ],
      event: "visit",
    });

    if (last.has(c)) {
      const prevLeft = left;
      left = last.get(c)! + 1;
      const backwards = left < prevLeft;
      const id = r.add({
        line: 5,
        iteration: it,
        title: backwards ? `left jumps back from ${prevLeft} to ${left}` : `Move left to ${left}`,
        explanation: backwards
          ? `last['${c}'] is ${left - 1}, which is outside the current window (it starts at ${prevLeft}). Setting left from it moves the window's start backwards and lets the earlier 'b's back in.`
          : `Skip past the previous '${c}' so the window has no duplicate.`,
        states: snapshot(right, c),
        pointers: ptrs(),
        highlights: [
          { structureId: "s", targets: windowTargets(right), tone: backwards ? "error" : "active" },
          { structureId: "last", targets: [c], tone: backwards ? "error" : "compare" },
        ],
        event: "update",
        isBugMoment: backwards,
      });
      if (backwards && !bugId) bugId = id;
    }

    last.set(c, right);
    r.add({
      line: 6,
      iteration: it,
      title: `Record last['${c}'] = ${right}`,
      explanation: `Remember that '${c}' was most recently at index ${right}.`,
      states: snapshot(right, c),
      pointers: ptrs(),
      highlights: [{ structureId: "last", targets: [c], tone: "active" }],
      event: "insert",
    });

    const len = right - left + 1;
    const improved = len > best;
    best = Math.max(best, len);
    const duplicateInWindow = new Set(chars.slice(left, right + 1)).size !== len;
    r.add({
      line: 7,
      iteration: it,
      title: `Window "${s.slice(left, right + 1)}" has length ${len}`,
      explanation: duplicateInWindow
        ? `This window contains a repeated character, yet its length ${len} is recorded as the best so far.`
        : improved
          ? `New best: ${best}.`
          : `Not longer than the best (${best}).`,
      states: snapshot(right, c),
      pointers: ptrs(),
      highlights: [{ structureId: "s", targets: windowTargets(right), tone: duplicateInWindow ? "error" : "success" }],
      event: "update",
    });
  }

  r.add({
    line: 8,
    title: `Return best = ${best}`,
    explanation: `The answer should be 2 ("ab" or "ba"), but the window "bba" was counted.`,
    states: snapshot(null, null),
    event: "output",
  });

  return {
    version: 1,
    summary: {
      understoodApproach:
        "You're sliding a window over the string and using a map of last-seen positions to jump the left edge past a repeated character.",
      verdict: "fails",
      testInputDescription: `s = "${s}"`,
      expectedOutput: "2",
      actualOutput: String(best),
    },
    codeLines: [
      "last = {}",
      "left = 0, best = 0",
      "for right in range(len(s)):",
      "    c = s[right]",
      "    if c in last:",
      "        left = last[c] + 1",
      "    last[c] = right",
      "    best = max(best, right - left + 1)",
      "return best",
    ],
    structures: [
      { id: "s", label: "s", kind: "string" },
      { id: "last", label: "last", kind: "hashmap" },
      { id: "vars", label: "Variables", kind: "variables" },
    ],
    loops: [{ id: "for", label: "for right", line: 2 }],
    steps: r.steps,
    diagnosis: {
      whatGoesWrong: `On the final 'a', left moves from 2 back to 1, so the window "bba" with a repeated 'b' is counted as valid.`,
      whyItGoesWrong:
        "The map remembers every character ever seen, including ones that are already outside the window. Using such a stale position can move the window's start backwards.",
      bugStepIds: bugId ? [bugId] : [],
      failingInputs: ['"abba"', '"tmmzuxt"'],
      thinkingHints: [
        "Should the left edge of a sliding window ever move to the left?",
        "When you look up last[c], is that position always inside the current window?",
        "Trace the window boundaries on \"abba\" and watch left on the last character.",
      ],
    },
  };
}
