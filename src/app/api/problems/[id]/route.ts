import { NextResponse, after, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { deleteProblemCascade } from "@/lib/cascade";
import { refreshProblemSource } from "@/lib/problemSource";
import { getOwnedProblem, serializeProblem } from "@/lib/problems";
import { updateProblemSchema } from "@/lib/schemas/problems";
import { Problem } from "@/models/Problem";

export function GET(req: NextRequest, ctx: RouteContext<"/api/problems/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    return NextResponse.json({ problem: serializeProblem(await getOwnedProblem(session.userId, id)) });
  });
}

export function PATCH(req: NextRequest, ctx: RouteContext<"/api/problems/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const input = await parseJson(req, updateProblemSchema);
    const existing = await getOwnedProblem(session.userId, id);

    const set: Record<string, unknown> = {};
    if (input.title !== undefined) set.title = input.title;
    if (input.statement !== undefined) set.statement = input.statement;
    if (input.tags !== undefined) {
      set.tags = input.tags;
      set.tagsSource = input.tags.length ? "user" : "none";
    }
    const update: Record<string, Record<string, unknown>> = { $set: set };
    const urlChanged = input.sourceUrl !== undefined && input.sourceUrl !== (existing.sourceUrl ?? "");
    if (urlChanged) {
      // The old page's text no longer applies; a new link is fetched after responding.
      update.$unset = { sourceText: "", sourceFetchedAt: "" };
      if (input.sourceUrl) set.sourceUrl = input.sourceUrl;
      else update.$unset.sourceUrl = "";
    }
    // Reference solutions are looked up by link and title, so either change means looking again on the next run.
    if (urlChanged || (input.title !== undefined && input.title !== existing.title)) set.references = [];
    const updated = await Problem.findOneAndUpdate(
      { _id: existing._id, userId: session.userId },
      update,
      { returnDocument: "after" },
    ).lean();
    if (urlChanged && input.sourceUrl) after(() => refreshProblemSource(existing._id, input.sourceUrl!));
    return NextResponse.json({ problem: serializeProblem(updated!) });
  });
}

export function DELETE(req: NextRequest, ctx: RouteContext<"/api/problems/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    await deleteProblemCascade(session.userId, problem._id);
    return NextResponse.json({ ok: true });
  });
}
