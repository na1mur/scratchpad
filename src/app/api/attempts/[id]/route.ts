import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiError, handle, parseWith, requireUser } from "@/lib/api";
import { IN_PROGRESS, getOwnedAttempt, serializeAttempt } from "@/lib/attempts";
import { deleteAttemptCascade } from "@/lib/cascade";

const querySchema = z.object({ specVersion: z.coerce.number().int().min(1).optional().catch(undefined) });

export function GET(req: NextRequest, ctx: RouteContext<"/api/attempts/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const { specVersion } = parseWith(querySchema, Object.fromEntries(req.nextUrl.searchParams));
    const attempt = await getOwnedAttempt(session.userId, id);
    return NextResponse.json({ attempt: await serializeAttempt(attempt, specVersion) });
  });
}

export function DELETE(req: NextRequest, ctx: RouteContext<"/api/attempts/[id]">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const attempt = await getOwnedAttempt(session.userId, id);
    // The pipeline would keep writing to it; let it finish (or go stale) first.
    if (IN_PROGRESS.has(attempt.status)) {
      throw new ApiError(409, "in_progress", "This attempt is still processing. Delete it once it's done.");
    }
    await deleteAttemptCascade(session.userId, attempt);
    return NextResponse.json({ ok: true });
  });
}
