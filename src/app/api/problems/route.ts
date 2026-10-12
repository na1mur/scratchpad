import { NextResponse, after, type NextRequest } from "next/server";
import { handle, parseJson, parseWith, requireUser } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import { generateProblemMeta } from "@/lib/ai/pipeline/title";
import { ensureProblemHarness } from "@/lib/harness/build";
import { refreshProblemSource } from "@/lib/problemSource";
import { createProblem, distinctTags, listProblems, serializeProblem } from "@/lib/problems";
import { createProblemSchema, listProblemsQuerySchema } from "@/lib/schemas/problems";
import { loadUser } from "@/lib/users";

export function GET(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const query = parseWith(listProblemsQuerySchema, Object.fromEntries(req.nextUrl.searchParams));
    const [list, tags] = await Promise.all([listProblems(session.userId, query), distinctTags(session.userId)]);
    return NextResponse.json({ ...list, tags });
  });
}

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const input = await parseJson(req, createProblemSchema);
    const user = await loadUser(session);
    const { model } = getModel(user, "reasoning");
    // Title and tags come first because they make the slug. The learner's own tags win over suggested ones.
    const meta = await generateProblemMeta(model, input.statement);
    const tags = input.tags.length ? input.tags : meta.tags;
    const problem = await createProblem({
      userId: user._id,
      title: meta.title,
      statement: input.statement,
      sourceUrl: input.sourceUrl || undefined,
      tags,
      tagsSource: input.tags.length ? "user" : tags.length ? "auto" : "none",
      language: user.preferredLanguage ?? "pseudocode",
    });
    // Fetched after responding; the pipelines fetch it themselves if a run starts before this finishes. The
    // harness reads the page text, so it comes second; runs use the old path until it's ready.
    after(async () => {
      if (problem.sourceUrl) await refreshProblemSource(problem._id, problem.sourceUrl);
      await ensureProblemHarness(problem._id);
    });
    return NextResponse.json({ problem: serializeProblem(problem.toObject()) }, { status: 201 });
  });
}
