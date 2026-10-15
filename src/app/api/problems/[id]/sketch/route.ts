import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { getOwnedProblem } from "@/lib/problems";
import { saveSketchSchema } from "@/lib/sketch/types";
import { loadSketch, saveSketch } from "@/lib/sketches";

export function GET(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/sketch">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const problem = await getOwnedProblem(session.userId, id);
    return NextResponse.json({ elements: await loadSketch(session.userId, problem._id) });
  });
}

/** Body: the elements that changed since the last save. Answers with the whole merged sketch. */
export function PUT(req: NextRequest, ctx: RouteContext<"/api/problems/[id]/sketch">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const { elements } = await parseJson(req, saveSketchSchema);
    const problem = await getOwnedProblem(session.userId, id);
    return NextResponse.json({ elements: await saveSketch(session.userId, problem._id, elements) });
  });
}
