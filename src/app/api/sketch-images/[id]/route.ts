import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { deleteImage } from "@/lib/sketchImages";

/** Removes a picture from the library. */
export function DELETE(req: NextRequest, ctx: RouteContext<"/api/sketch-images/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    await deleteImage(session.userId, id);
    return NextResponse.json({ ok: true });
  });
}
