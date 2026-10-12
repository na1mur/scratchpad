import { NextResponse, after, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { deleteProblemCascade } from "@/lib/cascade";
import { ensureProblemHarness } from "@/lib/harness/build";
import { refreshProblemSource } from "@/lib/problemSource";
import { getOwnedProblem, serializeProblem } from "@/lib/problems";
import { updateProblemSchema } from "@/lib/schemas/problems";
import { Problem } from "@/models/Problem";

// Building the problem's harness (src/lib/harness/build.ts) runs in after() and takes a model call or two.
export const maxDuration = 300;

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
    const update: Record<string, Record<string, unknown>> = { $set: set, $unset: {} };
    const urlChanged = input.sourceUrl !== undefined && input.sourceUrl !== (existing.sourceUrl ?? "");
    const statementChanged = input.statement !== undefined && input.statement !== existing.statement;
    if (urlChanged) {
      // The old page's text no longer applies; a new link is fetched after responding.
      Object.assign(update.$unset, { sourceText: "", sourceFetchedAt: "" });
      if (input.sourceUrl) set.sourceUrl = input.sourceUrl;
      else update.$unset.sourceUrl = "";
    }
    // Reference solutions are looked up by link and title, so either change means looking again on the next run.
    if (urlChanged || (input.title !== undefined && input.title !== existing.title)) set.references = [];
    // The test cases and signature come from the statement and the linked page: build them again.
    if (urlChanged || statementChanged) update.$unset.harness = "";
    if (!Object.keys(update.$unset).length) delete update.$unset;
    const updated = await Problem.findOneAndUpdate(
      { _id: existing._id, userId: session.userId },
      update,
      { returnDocument: "after" },
    ).lean();
    if (urlChanged || statementChanged) {
      after(async () => {
        if (urlChanged && input.sourceUrl) await refreshProblemSource(existing._id, input.sourceUrl);
        await ensureProblemHarness(existing._id);
      });
    }
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
