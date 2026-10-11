import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { createShare, removeShare } from "@/lib/shares";

/** Makes this solution public; returns the link's token. */
export function PUT(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/share">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    return NextResponse.json({ token: await createShare(session.userId, "solution", id) });
  });
}

/** Unshares it; the old link stops working. */
export function DELETE(req: NextRequest, ctx: RouteContext<"/api/solutions/[id]/share">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    await removeShare(session.userId, "solution", id);
    return NextResponse.json({ ok: true });
  });
}
