import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { serializeProblem } from "@/lib/problems";
import { forkSharedProblem } from "@/lib/shares";
import { loadUser } from "@/lib/users";

/** Copies a shared problem into the caller's account and returns it, so the client can open it. */
export function POST(req: NextRequest, ctx: RouteContext<"/api/shared/[token]/fork">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { token } = await ctx.params;
    const user = await loadUser(session);
    const problem = await forkSharedProblem(token, session.userId, user.preferredLanguage ?? "pseudocode");
    return NextResponse.json({ problem: serializeProblem(problem.toObject()) }, { status: 201 });
  });
}
