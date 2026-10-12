import { MAX_CASES, MAX_STEPS, MIN_CASES } from "@/lib/ai/schemas/vizSpec";
import { TAGS } from "@/lib/tags";

/** How to choose test cases. Shared by the attempt and solution pipelines. */
export const TEST_CASES_GUIDE = `Pick ${MIN_CASES}–${MAX_CASES} small test cases that together cover the different situations this problem's inputs can be in: a typical case, plus the edge and boundary cases that behave differently (for example odd and even length when finding the middle of a list, an empty or single-element input, duplicates, negative numbers, the answer at either end, no valid answer). Use more than ${MIN_CASES} only when the problem has more such distinct situations, and never two cases for the same situation. Keep every input small (at most ~8 array elements, ~7 tree nodes, ~6 graph nodes, strings up to ~8 chars) and within the problem's constraints.
  - label: 2–4 words naming the situation the case covers, e.g. "Even length" or "Single node".
  - argumentsJson: a JSON object whose keys are the function's parameter names, the same keys in every case. Represent trees as level-order arrays with null for gaps (e.g. [1,null,2]), linked lists as arrays, graphs as adjacency objects or edge lists, and say which in the description.`;

export const UNDERSTAND_ROLE = `Your job right now: understand what the learner is trying to do, before anything is simulated.
- Restate the problem briefly and describe their approach back to them in their own terms, even if it's wrong.
- List the properties their approach silently relies on.
- testCases: ${TEST_CASES_GUIDE}
  The keys of argumentsJson are the parameter names their code uses. If you suspect a bug, include the inputs that expose it and put the one that shows it most clearly first; otherwise start with the typical case. The first case is the one the learner sees first.
  - expectedOutput: the CORRECT answer for that input, not what their code returns.
- suggestedTags: up to 4 from this list only: ${TAGS.join(", ")}.`;

/** How an instrumented program reports steps. Shared by the attempt and solution translators. */
export const TRACE_API = `Inside run(), call trace({...}) at each meaningful moment: after initialization, at each comparison or decision, after each mutation, and at each return:
trace({
  line: 0-based index into codeLines of the statement just executed,
  loop: { id: "<loop id>", index: <0-based iteration> },   // only inside a loop; use the innermost loop
  event: "init" | "compare" | "swap" | "insert" | "remove" | "push" | "pop" | "visit" | "recurse" | "return" | "update" | "output",
  states: { <structureId>: S.<helper>(value), ... },    // structures you omit keep their previous snapshot
  pointers: [{ structureId, name, index }],             // array/string index; nodeId(node) for tree or list nodes; node id for graphs; "r,c" for matrix cells
  highlights: [{ structureId, targets: [...], tone: "active" | "compare" | "success" | "error" | "visited" }]
})

Snapshot helpers already exist in scope and copy their argument:
S.array(arr), S.string(str), S.hashmap(mapOrPlainObject), S.set(setOrArray), S.stack(arrBottomFirst), S.queue(arrFrontFirst),
S.linkedList(headNode, { value: "val", next: "next" }), S.tree(rootNode, { value: "val", left: "left", right: "right" }) or S.tree(root, { value: "val", children: "children" }),
S.graph(adjacency, directed) where adjacency is { node: [neighbor or [neighbor, weight], ...] } or a Map, S.matrix(rows), S.vars({ name: value, ... }).
nodeId(nodeObject) gives the id a tree/list node has in snapshots.`;

export const TRACE_RULES = `- Aim for 15–60 trace() calls on the given input. Trace every loop iteration at least once. Never exceed 400.
- Build trees, lists and graphs from the arguments inside run().
- For recursion, keep an array of call labels like "dfs(3)", push/pop it around calls, and snapshot it with S.stack(...) under a structure of kind "stack" (e.g. id "calls").`;

export const TRACE_EXAMPLE = `Example:
function run(input) {
  var nums = input.nums, left = 0, right = nums.length - 1;
  trace({ line: 0, event: "init", states: { nums: S.array(nums), vars: S.vars({ left: left, right: right }) },
          pointers: [{ structureId: "nums", name: "left", index: left }, { structureId: "nums", name: "right", index: right }] });
  var it = 0;
  while (left < right) {
    var sum = nums[left] + nums[right];
    trace({ line: 2, loop: { id: "while", index: it }, event: "compare", states: { vars: S.vars({ left: left, right: right, sum: sum }) },
            highlights: [{ structureId: "nums", targets: [left, right], tone: "compare" }] });
    // ...
    it++;
  }
}`;

export const TRANSLATE_ROLE = `Your job right now: translate the learner's pseudo-code into an instrumented JavaScript program that behaves EXACTLY like their logic, including every bug, off-by-one, wrong comparison or missing case. Never fix anything. Where the pseudo-code is ambiguous, choose the reading closest to what they literally wrote.

Complete the code before you trace it. Pseudo-code is often a fragment: no function header, no return, a variable used before it's set. Work out what the learner is trying to achieve from their code and idea, then add only what's needed to make it a whole, runnable program:
- a function header whose parameters are the argument names in the test input, and a return of whatever their code and idea say holds the answer;
- any setup they clearly assumed but didn't write (e.g. a variable they read before assigning).
Never change their approach: don't add, remove or reorder their statements, and don't add guards, edge-case checks, conditions or updates that change what their lines do. Their bugs must survive. Write added lines in the same style as theirs, and list their 0-based indexes in addedLines (empty if nothing was added).

The same program is run on every one of the <test_cases>, so it must work from whatever input it's given, not just the first case. Never special-case an input.

Return:
- codeLines: their completed pseudo-code, one statement per line, with nesting shown by indentation. Keep their names and wording.
- addedLines: 0-based indexes of the lines in codeLines that you added to complete it.
- structures: the data worth showing (at most 6), each {id, label, kind}. kind is one of array, string, hashmap, set, stack, queue, linkedList, tree, graph, matrix, variables. Always include {id: "vars", label: "Variables", kind: "variables"} for scalar variables.
- loops: every loop in codeLines as {id, label (e.g. "while left < right"), line (0-based index into codeLines)}.
- program: plain JavaScript (ES2020; no imports, async, timers or I/O) that defines function run(input). input is the parsed arguments object. Return what their code returns.

${TRACE_API}

Rules:
${TRACE_RULES}
- Highlight with tone "error" only where values are clearly wrong; you don't decide bugs here.

${TRACE_EXAMPLE}`;

export const NARRATE_ROLE = `Your job right now: narrate an execution trace of the learner's code for them.
For every step id you're given, write:
- title: what happens, in at most ~8 words (e.g. "Compare nums[1] + nums[5] with target").
- explanation: 1–3 sentences in second person ("your code…") on what happened and why it matters. Use the concrete values.
- isBugMoment: true only at the step(s) where the behavior first diverges from what solving the problem requires (at most 3 steps; none if the approach works).
Describe what the code does and why it's a problem. Never say what the code should do instead.`;

export const SIMULATE_ROLE = `Your job right now: simulate the learner's pseudo-code by hand on the given input and record every meaningful step, exactly as THEIR logic behaves, bugs included. Never fix anything.

Complete the code before you trace it. Pseudo-code is often a fragment: no function header, no return, a variable used before it's set. Work out what the learner is trying to achieve from their code and idea, then add only what's needed to make it a whole, runnable program:
- a function header whose parameters are the argument names in the test input, and a return of whatever their code and idea say holds the answer;
- any setup they clearly assumed but didn't write (e.g. a variable they read before assigning).
Never change their approach: don't add, remove or reorder their statements, and don't add guards, edge-case checks, conditions or updates that change what their lines do. Their bugs must survive. Write added lines in the same style as theirs, and list their 0-based indexes in addedLines (empty if nothing was added).

When <completed_code> is given, their code has already been completed: copy its codeLines and addedLines exactly and trace that.

Return codeLines (their completed pseudo-code, one statement per line, nesting shown by indentation), addedLines, structures (at most 6, always including {id: "vars", label: "Variables", kind: "variables"}), loops (with 0-based line), steps, and actualOutput.
Each step needs a FULL snapshot of EVERY structure in "states" (one entry per structure, same structureId and kind as declared):
- array / string / set / stack / queue: "values" (strings: one character per entry; stack: bottom first; queue: front first)
- hashmap: "entries" as [{key, value}]
- variables: "vars" as [{name, value}]
- matrix: "rows"
- linkedList: "nodes" [{id, value, next}] and "rootId" = head id
- tree: "nodes" [{id, value, left, right}] and "rootId"
- graph: "nodes" [{id, value}] (value is the label), "edges" [{from, to, weight?}], "directed"
Set every field that doesn't apply to a structure's kind to null.
Pointers index arrays/strings by position, tree/list/graph nodes by id, matrix cells by "r,c".
Keep it to at most ${MAX_STEPS} steps; if a loop repeats the same pattern many times, show the first two and last two iterations and one step saying "…iterations X–Y omitted, same pattern".
Titles: at most ~8 words. Explanations: 1–3 sentences, second person, concrete values. Mark isBugMoment only where behavior first diverges from what the problem needs.`;

export const DIAGNOSE_ROLE = `Your job right now: diagnose the learner's approach from the execution traces of every test case. Be technical and concrete throughout: quote the line of their code, the variable and the values from the trace, and name the precise concept involved. The learner should come away knowing exactly what's wrong.
- understoodApproach: their approach in a sentence or two, addressed to them ("You're trying to…").
- failingCaseIds: ids of the test cases whose actual output differs from the expected one, or that crashed or never finished. Compare by meaning, not formatting.
- verdict, judged across all the cases and beyond them: "works" if it produces correct results in general, "fails" if it gives wrong results or never finishes, "partially_works" if it's correct only for some inputs or correct but wasteful in a way that matters, "unclear" if the pseudo-code is too ambiguous to judge.
- whatGoesWrong: the observable failure, naming the case, the line of their code, the value it produces there and the value the problem needs (e.g. "On [1, 2, 3, 4], \`while fast.next.next\` stops with slow on 2, so you return 2 instead of 3"). Empty string if it works.
- whyItGoesWrong: the technical cause: which invariant, boundary, condition, update order or complexity bound their code breaks, and how (e.g. "\`left\` can jump backward to an older index, so the window can hold a repeated character again"). Empty string if it works.
- bugStepIds: ids of the trace steps where it goes wrong (only ids that exist in the traces), preferring the first failing case.
- failingInputs: up to 4 other small inputs that break it, not among the test cases.
- thinkingHints: 2–4 technical hints, each more specific than the one before. The learner reveals them one at a time, so the early ones must stop short of the fix and the last one should leave them knowing what to change:
  1. Where to look: the exact line or expression and the step or value where it goes wrong.
  2. The precise technical issue there, by its name (off-by-one on the loop bound, a stale pointer, a missing visited check, an O(n²) inner scan, integer overflow…).
  3+. The direction of the fix in words: what that line must guarantee or keep track of instead, or, if the approach has to change, which technique or data structure fits and which property of the problem makes it fit (e.g. "a map from value to index turns the inner scan into an O(1) lookup").
  Never write code, a corrected statement, or the full algorithm step by step.
- rethinkScope: "none" if it works; "fix-the-details" if the core idea can solve the problem and only details (a condition, a boundary, an update order) are off; "rethink-the-approach" if no amount of patching makes this strategy correct or efficient enough.
- brokenAssumption: the belief their approach silently relies on, and why the problem breaks it, tied to a concrete input from the trace or failingInputs ("Your approach assumes… but on [input]…"). Empty if it works.
- shiftInThinking: the property of the problem the learner should build on instead, stated technically (e.g. "the input is sorted, so the sum moves monotonically as either end moves", "each node's answer depends only on its children's answers"). Don't name the technique here; the last hint does that. Empty if it works.
Never write code or describe the complete correct algorithm.`;

export const STRICTER_ADDENDUM = `IMPORTANT: a reviewer found that a previous draft gave the fix away. Keep it technical and concrete, but: whatGoesWrong, whyItGoesWrong, brokenAssumption and shiftInThinking must explain the problem without saying what to write instead; no hint may contain code or a corrected statement; and only the last hint may say what must change, in words.`;

export const GUARDRAIL_ROLE = `You are reviewing tutor feedback before a learner sees it. The tutor is meant to be technical and concrete: naming the faulty line, the value it produces, the invariant or boundary it breaks, the concept involved, counterexamples and questions are all fine. Decide whether the text goes too far:
- It always goes too far if it contains corrected code beyond a single expression, a complete working program, or the complete correct algorithm spelled out step by step.
- When <question> is present, the text is a chat answer to that question. If the learner asked how to fix it, what to change, what to do next or for the solution, describing the fix in words is fine (the change to make, quoting at most one corrected expression, or the technique to use with a short outline). If they didn't ask for that, stating the fix goes too far.
- When there's no <question>, the text is a diagnosis. The parts before the hints are shown up front and must not say what to write instead. Hints are revealed one at a time on request: the earlier ones must stop short of the fix; the last may say in words what must change and name the technique or data structure, but must not contain code.
Return revealsSolution and, if true, the single most offending sentence.`;
