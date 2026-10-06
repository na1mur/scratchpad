import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { handle, parseWith, requireUser } from "@/lib/api";
import { getOwnedAttempt, serializeAttempt } from "@/lib/attempts";

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
