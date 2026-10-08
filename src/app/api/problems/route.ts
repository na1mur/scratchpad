import { NextResponse, after, type NextRequest } from "next/server";
import { handle, parseJson, parseWith, requireUser } from "@/lib/api";
import { getModel } from "@/lib/ai/providers";
import { generateProblemTitle } from "@/lib/ai/pipeline/title";
import { refreshProblemSource } from "@/lib/problemSource";
import { distinctTags, listProblems, serializeProblem } from "@/lib/problems";
import { createProblemSchema, listProblemsQuerySchema } from "@/lib/schemas/problems";
import { loadUser } from "@/lib/users";
import { Problem } from "@/models/Problem";

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
    const problem = await Problem.create({
      userId: user._id,
      title: await generateProblemTitle(model, input.statement),
      statement: input.statement,
      sourceUrl: input.sourceUrl || undefined,
      tags: input.tags,
      tagsSource: input.tags.length ? "user" : "none",
      language: user.preferredLanguage ?? "pseudocode",
    });
    // Fetched after responding; the pipelines fetch it themselves if a run starts before this finishes.
    if (problem.sourceUrl) after(() => refreshProblemSource(problem._id, problem.sourceUrl!));
    return NextResponse.json({ problem: serializeProblem(problem.toObject()) }, { status: 201 });
  });
}
