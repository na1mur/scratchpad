import { z } from "zod";
import { COMPARE_MODES } from "@/lib/harness/types";

/** Most fixed test cases a problem gets: each one is traced and narrated on every attempt. */
export const HARNESS_MAX_CASES = 6;

/** Model-facing: the harness the model proposes, checked and run in code (src/lib/harness/build.ts). */
export const harnessDraftSchema = z.object({
  fits: z
    .boolean()
    .describe(
      "False when a solution isn't one function call on the supported types: a class with several methods, an interactive problem, graphs of Node objects, output that is random.",
    ),
  whyNot: z.string().describe("When fits is false, why, in one sentence; otherwise empty."),
  functionName: z.string().describe("The function a solution defines, in camelCase, e.g. 'twoSum'."),
  params: z.array(z.object({ name: z.string(), type: z.string() })).describe("In call order, with types from the list."),
  returnType: z.string().describe("A type from the list, or 'void' when the function changes an argument in place."),
  outputParam: z.string().describe("For a void function: the name of the argument it changes, which holds the answer. Otherwise empty."),
  cycleParam: z
    .string()
    .describe("For a linked-list cycle problem: the ListNode parameter whose tail links back to the node at index pos. Otherwise empty."),
  compare: z.enum(COMPARE_MODES),
  cases: z.array(
    z.object({
      label: z.string().describe("2–4 words naming the situation, e.g. 'Empty list'."),
      argumentsJson: z.string().describe('JSON object of the arguments by parameter name, e.g. {"nums":[2,7,11,15],"target":9}.'),
      expectedJson: z.string().describe("The correct answer as JSON, e.g. [0,1]."),
    }),
  ),
  referenceSolution: z
    .string()
    .describe("A correct JavaScript solution: a top-level function named functionName taking the parameters in order."),
});
export type HarnessDraft = z.infer<typeof harnessDraftSchema>;
