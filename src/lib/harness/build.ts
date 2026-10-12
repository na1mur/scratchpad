import "server-only";
import type { LanguageModel } from "ai";
import { HARNESS_ROLE } from "@/lib/ai/prompts/harness";
import { referenceBlock, sourceBlock } from "@/lib/ai/prompts/system";
import { getModel } from "@/lib/ai/providers";
import { PipelineError, UsageMeter, formatRunStats, generateStructured } from "@/lib/ai/pipeline/llm";
import { runFunction } from "@/lib/ai/pipeline/sandbox";
import { HARNESS_MAX_CASES, harnessDraftSchema, type HarnessDraft } from "@/lib/ai/schemas/harness";
import { MIN_CASES } from "@/lib/ai/schemas/vizSpec";
import { connectDB } from "@/lib/db";
import { ensureProblemReference, leetCodeSlug } from "@/lib/problemReference";
import { ensureProblemSource, safeRequest } from "@/lib/problemSource";
import { userSearchKey } from "@/lib/tavily";
import { Problem, type ProblemDoc } from "@/models/Problem";
import { User } from "@/models/User";
import {
  answerType,
  callSpec,
  checkValue,
  nodeAnswer,
  parseType,
  sameAnswer,
  type CallSpec,
  type Harness,
  type HarnessCase,
  type HarnessCycle,
  type HarnessParam,
  type ReadyHarness,
} from "./types";

/**
 * Builds a problem's harness (src/lib/harness/types.ts): the signature, from LeetCode's own metadata when the
 * problem links there and from the model otherwise; fixed test cases chosen by the model; and their expected
 * answers, computed by running a reference solution the model writes in the sandbox. A case where the model's
 * stated answer and the run disagree gets one rewrite; one that still disagrees is dropped. Runs in the
 * background (on create, on edit, on visiting an older problem) so attempts find it ready.
 */

type Signature = { functionName: string; params: HarnessParam[]; returnType: string; outputParam?: string; cycle?: HarnessCycle };

type LeetCodeInfo = { signature: Signature; examples: Record<string, unknown>[] } | { unsupported: string };

type LeetCodeMeta = {
  name?: string;
  params?: { name: string; type: string }[];
  return?: { type: string };
  output?: { paramindex?: number };
  classname?: string;
  systemdesign?: boolean;
  manual?: boolean;
};

/** The signature and example inputs LeetCode publishes for a problem. */
async function leetCodeInfo(slug: string): Promise<LeetCodeInfo | null> {
  const res = await safeRequest(new URL("https://leetcode.com/graphql"), {
    method: "POST",
    headers: { "content-type": "application/json", referer: `https://leetcode.com/problems/${slug}/` },
    body: JSON.stringify({
      query: "query q($titleSlug: String!) { question(titleSlug: $titleSlug) { metaData exampleTestcaseList } }",
      variables: { titleSlug: slug },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status !== 200) return null;
  const q = (JSON.parse(res.body) as { data?: { question?: { metaData?: string; exampleTestcaseList?: string[] } | null } }).data
    ?.question;
  if (!q?.metaData) return null;
  const meta = JSON.parse(q.metaData) as LeetCodeMeta;
  if (meta.classname || meta.systemdesign) return { unsupported: "It's a design problem: a class with several methods." };
  if (!meta.name || !meta.params || !meta.return) return null;
  // `manual`: the judge builds the input from something the function doesn't take. The one shape handled is a
  // list whose tail links back to index `pos` (Linked List Cycle I and II); the rest stay unsupported.
  let cycle: HarnessCycle | undefined;
  if (meta.manual) {
    const lists = meta.params.filter((p) => p.type === "ListNode");
    const pos = meta.params.find((p) => p.name === "pos" && p.type === "integer");
    if (lists.length !== 1 || !pos || meta.params.length !== 2) {
      return { unsupported: "Its tests build the input in a way a plain function call can't." };
    }
    cycle = { param: lists[0].name, pos: pos.name };
  }
  const unknown = [...meta.params.map((p) => p.type), meta.return.type].filter((t) => !parseType(t));
  if (unknown.length) return { unsupported: `It uses types the runner doesn't support: ${[...new Set(unknown)].join(", ")}.` };

  const all = meta.params.map((p) => ({ name: p.name, type: p.type }));
  // A cycle's `pos` is in every example but isn't passed to the function.
  const params = all.filter((p) => p.name !== cycle?.pos);
  const outputIndex = meta.output?.paramindex;
  const examples = (q.exampleTestcaseList ?? []).flatMap((text) => {
    const lines = text.split("\n");
    if (lines.length !== all.length) return [];
    try {
      return [Object.fromEntries(all.map((p, i) => [p.name, JSON.parse(lines[i])]))];
    } catch {
      return [];
    }
  });
  return {
    signature: {
      functionName: meta.name,
      params,
      returnType: meta.return.type,
      ...(outputIndex !== undefined && all[outputIndex] && { outputParam: all[outputIndex].name }),
      ...(cycle && { cycle }),
    },
    examples,
  };
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

function parseObject(json: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** The draft as a callable signature, or the issues the model has to fix. */
function checkDraft(d: HarnessDraft, fixed: Signature | null): { issues: string[]; call?: CallSpec } {
  if (!d.fits) return { issues: [] };
  const issues: string[] = [];
  const sig: Signature = fixed ?? {
    functionName: d.functionName,
    params: d.params,
    returnType: d.returnType,
    ...(d.outputParam && { outputParam: d.outputParam }),
    ...(d.cycleParam && { cycle: { param: d.cycleParam, pos: "pos" } }),
  };
  if (sig.cycle) {
    if (sig.params.find((p) => p.name === sig.cycle!.param)?.type !== "ListNode") {
      issues.push(`- cycleParam "${sig.cycle.param}" must name a ListNode parameter`);
    }
    if (sig.params.some((p) => p.name === sig.cycle!.pos)) issues.push(`- "${sig.cycle.pos}" isn't a parameter; leave it out of params`);
  }
  if (!IDENT.test(sig.functionName)) issues.push(`- functionName "${sig.functionName}" isn't a valid identifier`);
  const names = new Set<string>();
  const params: CallSpec["params"] = [];
  for (const p of sig.params) {
    if (!IDENT.test(p.name) || names.has(p.name)) issues.push(`- parameter name "${p.name}" is invalid or repeated`);
    names.add(p.name);
    const type = parseType(p.type);
    if (!type || type.kind === "void") issues.push(`- parameter ${p.name} has unsupported type "${p.type}"`);
    else params.push({ name: p.name, type });
  }
  const returnType = parseType(sig.returnType);
  if (!returnType) issues.push(`- unsupported returnType "${sig.returnType}"`);
  const outputIndex = sig.outputParam ? sig.params.findIndex((p) => p.name === sig.outputParam) : -1;
  if (returnType?.kind === "void" && outputIndex < 0) issues.push("- a void function needs outputParam naming the argument it changes");
  if (fixed && d.functionName !== fixed.functionName) issues.push(`- functionName must be "${fixed.functionName}" as in <signature>`);

  if (d.cases.length < MIN_CASES || d.cases.length > HARNESS_MAX_CASES) {
    issues.push(`- give ${MIN_CASES}–${HARNESS_MAX_CASES} cases`);
  }
  const answer = answerType(sig);
  // Every case gives the parameters, plus `pos` for a cycle list.
  const keysWanted = [...names, ...(sig.cycle ? [sig.cycle.pos] : [])];
  const seen = new Set<string>();
  d.cases.forEach((c, i) => {
    const args = parseObject(c.argumentsJson);
    if (!args) return issues.push(`- cases[${i}].argumentsJson must be a JSON object`);
    const keys = Object.keys(args).sort().join(",");
    if (keys !== [...keysWanted].sort().join(",")) {
      return issues.push(`- cases[${i}].argumentsJson must have exactly the keys ${keysWanted.join(", ")}`);
    }
    for (const p of params) {
      const issue = checkValue(p.type, args[p.name], `cases[${i}] argument ${p.name}`);
      if (issue) issues.push(`- ${issue}`);
    }
    if (sig.cycle && !Number.isInteger(args[sig.cycle.pos])) issues.push(`- cases[${i}].${sig.cycle.pos} must be an integer (-1 for no cycle)`);
    const key = JSON.stringify(keysWanted.map((k) => args[k]));
    if (seen.has(key)) issues.push(`- cases[${i}] repeats another case's arguments`);
    seen.add(key);
    try {
      const expected = JSON.parse(c.expectedJson);
      const issue = answer && answer.kind !== "void" ? checkValue(answer, expected, `cases[${i}].expectedJson`) : null;
      if (issue) issues.push(`- ${issue}`);
    } catch {
      issues.push(`- cases[${i}].expectedJson isn't valid JSON`);
    }
  });
  if (!d.referenceSolution.trim()) issues.push("- referenceSolution is empty");
  const call = issues.length ? null : callSpec(sig);
  return call ? { issues, call } : { issues: issues.length ? issues : ["- the signature's types can't be run"] };
}

type Verified = { draft: HarnessDraft; call: CallSpec; cases: (HarnessCase | null)[]; disagreements: string[] };

/** Runs the reference solution on every case; a case keeps the computed answer when it agrees with the stated one. */
async function verify(draft: HarnessDraft, call: CallSpec): Promise<Verified> {
  const disagreements: string[] = [];
  const cases = await Promise.all(
    draft.cases.map(async (c, i): Promise<HarnessCase | null> => {
      const args = parseObject(c.argumentsJson)!;
      const run = await runFunction(draft.referenceSolution, call, args);
      const where = `- cases[${i}] (${c.label}) ${c.argumentsJson}`;
      if (run.outcome !== "ok" || run.returnJson === null) {
        disagreements.push(`${where}: referenceSolution failed: ${run.errorMessage ?? run.outcome}`);
        return null;
      }
      const actual = JSON.parse(run.returnJson);
      const stated = JSON.parse(c.expectedJson);
      const agrees = sameAnswer(draft.compare, actual, call.answerType.kind === "nodeIndex" ? nodeAnswer(stated) : stated);
      if (agrees === false) {
        disagreements.push(`${where}: you said ${c.expectedJson} but referenceSolution returned ${run.returnJson}`);
        return null;
      }
      return { label: c.label.trim().slice(0, 60) || `Case ${i + 1}`, argsJson: JSON.stringify(args), expectedJson: run.returnJson };
    }),
  );
  return { draft, call, cases, disagreements };
}

function signatureBlock(sig: Signature): string {
  const params = sig.params.map((p) => `${p.name}: ${p.type}`).join(", ");
  const cycle = sig.cycle
    ? `\n${sig.cycle.param}'s tail links back to the node at index ${sig.cycle.pos} (-1: no cycle). Every case's argumentsJson gives ${sig.cycle.pos}, but it isn't passed to the function.${
        parseType(sig.returnType)?.kind === "list" ? " The function returns a node of that list: give expectedJson as the node's index in the list, or null." : ""
      }`
    : "";
  return `<signature>\n${sig.functionName}(${params}) -> ${sig.returnType}${
    sig.outputParam ? ` (changes ${sig.outputParam} in place; that's the answer)` : ""
  }${cycle}\n</signature>`;
}

export async function buildHarness(opts: {
  model: LanguageModel;
  meter: UsageMeter;
  statement: string;
  source: string;
  reference: string;
  sourceUrl?: string | null;
}): Promise<Harness> {
  const slug = leetCodeSlug(opts.sourceUrl);
  const lc = slug ? await leetCodeInfo(slug).catch(() => null) : null;
  if (lc && "unsupported" in lc) return { status: "unsupported", reason: lc.unsupported, builtAt: new Date(), version: HARNESS_VERSION };
  const fixed = lc?.signature ?? null;

  const prompt = [
    `<problem>\n${opts.statement}\n</problem>`,
    sourceBlock(opts.source),
    referenceBlock(opts.reference),
    fixed && signatureBlock(fixed),
    lc?.examples.length && `<examples>\n${lc.examples.map((e) => JSON.stringify(e)).join("\n")}\n</examples>`,
  ]
    .filter(Boolean)
    .join("\n\n");

  let feedback = "";
  let best: Verified | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let call: CallSpec | undefined;
    const draft = await generateStructured({
      model: opts.model,
      meter: opts.meter,
      name: "test harness",
      schema: harnessDraftSchema,
      instructions: HARNESS_ROLE,
      prompt: feedback ? `${prompt}\n\n<previous_harness_failed>\n${feedback}\n</previous_harness_failed>` : prompt,
      maxOutputTokens: 8_000,
      check: (d) => {
        const checked = checkDraft(d, fixed);
        call = checked.call;
        return checked.issues.length ? { ok: false, issues: checked.issues.join("\n") } : { ok: true, value: d };
      },
    });
    if (!draft.fits || !call) {
      return {
        status: "unsupported",
        reason: draft.whyNot.slice(0, 300) || "It isn't a single function call.",
        builtAt: new Date(),
        version: HARNESS_VERSION,
      };
    }
    const verified = await verify(draft, call);
    const agreed = (v: Verified) => v.cases.filter(Boolean).length;
    if (!best || agreed(verified) > agreed(best)) best = verified;
    if (!verified.disagreements.length) break;
    opts.meter.note(`harness ${attempt + 1}: ${verified.disagreements.length} case(s) disagreed`);
    feedback = `Running referenceSolution on your cases disagreed with expectedJson:\n${verified.disagreements.join(
      "\n",
    )}\nFix whichever is wrong (the solution or the expected answer) and answer again in full.`;
  }

  const cases = best!.cases.filter((c): c is HarnessCase => c !== null);
  if (cases.length < MIN_CASES) {
    return { status: "failed", reason: "The reference solution and the expected answers kept disagreeing.", builtAt: new Date() };
  }
  const { draft, call } = best!;
  const harness: ReadyHarness = {
    status: "ready",
    origin: fixed ? "leetcode" : "generated",
    functionName: call.functionName,
    params: (fixed ?? draft).params.map((p) => ({ name: p.name, type: p.type })),
    returnType: fixed?.returnType ?? draft.returnType,
    ...(call.outputIndex !== undefined && { outputParam: (fixed ?? draft).params[call.outputIndex].name }),
    ...(call.cycle && { cycle: call.cycle }),
    compare: draft.compare,
    cases,
    referenceJs: draft.referenceSolution,
    builtAt: new Date(),
  };
  return harness;
}

/**
 * Raised whenever the runner learns to handle problems it used to call unsupported, so those get another
 * try. 2: linked-list cycle problems.
 */
const HARNESS_VERSION = 2;

/** A build that died (a crashed or timed-out function) is taken over after this. */
const STALE_BUILD_MS = 10 * 60_000;
/** A harness the model couldn't get right is tried again after this. */
const RETRY_FAILED_MS = 24 * 60 * 60_000;

/** Whether the harness is missing or due another try; a build already running doesn't count. */
export function needsHarness(h: unknown, now = Date.now()): boolean {
  const harness = h as Harness | null | undefined;
  if (!harness) return true;
  if (harness.status === "unsupported") return (harness.version ?? 1) < HARNESS_VERSION;
  if (harness.status === "building") return now - new Date(harness.startedAt).getTime() > STALE_BUILD_MS;
  if (harness.status === "failed") return now - new Date(harness.builtAt).getTime() > RETRY_FAILED_MS;
  return false;
}

/**
 * Builds the problem's harness if it's missing or due, on its owner's model. A claim on the problem keeps two
 * requests from building it at once, and the result is only written if that claim still holds (an edit
 * resets it). Never throws: a provider failure releases the claim so a later visit tries again.
 */
export async function ensureProblemHarness(problemId: string | ProblemDoc["_id"]): Promise<void> {
  await connectDB();
  const startedAt = new Date();
  const problem = await Problem.findOneAndUpdate(
    {
      _id: problemId,
      $or: [
        { harness: { $exists: false } },
        { harness: null },
        { "harness.status": "building", "harness.startedAt": { $lt: new Date(startedAt.getTime() - STALE_BUILD_MS) } },
        { "harness.status": "failed", "harness.builtAt": { $lt: new Date(startedAt.getTime() - RETRY_FAILED_MS) } },
        // Judged unsupported by an older version, before the runner handled more kinds of problem.
        { "harness.status": "unsupported", "harness.version": { $not: { $gte: HARNESS_VERSION } } },
      ],
    },
    { $set: { harness: { status: "building", startedAt } } },
    { returnDocument: "after" },
  ).lean();
  if (!problem) return;
  const ours = { _id: problem._id, "harness.status": "building", "harness.startedAt": startedAt };
  const meter = new UsageMeter();

  try {
    const user = await User.findById(problem.userId).lean();
    if (!user) return;
    const { model } = getModel(user, "reasoning");
    const [source, reference] = await Promise.all([
      ensureProblemSource(problem),
      ensureProblemReference(problem, problem.language, userSearchKey(user)),
    ]);
    const harness = await buildHarness({
      model,
      meter,
      statement: problem.statement,
      source,
      reference: reference?.text ?? "",
      sourceUrl: problem.sourceUrl,
    });
    await Problem.updateOne(ours, { $set: { harness } });
    console.info(
      formatRunStats(
        `[harness] problem ${problem._id} ${harness.status}${"reason" in harness ? ` (${harness.reason})` : ""}${
          harness.status === "ready" ? ` with ${harness.cases.length} cases` : ""
        }`,
        meter.report(),
      ),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.info(formatRunStats(`[harness] problem ${problem._id} failed: ${message}`, meter.report()));
    // The model couldn't produce a usable harness: wait a day. Anything else (no key, provider down): retry soon.
    if (err instanceof PipelineError && err.code === "invalid_output") {
      await Problem.updateOne(ours, { $set: { harness: { status: "failed", reason: message.slice(0, 300), builtAt: new Date() } } });
    } else {
      await Problem.updateOne(ours, { $unset: { harness: "" } });
    }
  }
}

/** The ready harness's call, with its types parsed. */
export function harnessCall(h: ReadyHarness): CallSpec | null {
  return callSpec(h);
}
