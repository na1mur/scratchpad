import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { deleteSolutionCascade } from "@/lib/cascade";
import { SOLUTION_IN_PROGRESS, getOwnedSolution, serializeSolution } from "@/lib/solutions";

export function GET(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const solution = await getOwnedSolution(session.userId, id);
    return NextResponse.json({ solution: await serializeSolution(solution) });
  });
}

export function DELETE(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const solution = await getOwnedSolution(session.userId, id);
    if (SOLUTION_IN_PROGRESS.has(solution.status)) {
      throw new ApiError(409, "in_progress", "This solution is still being written. Delete it once it's done.");
    }
    await deleteSolutionCascade(session.userId, solution);
    return NextResponse.json({ ok: true });
  });
}
