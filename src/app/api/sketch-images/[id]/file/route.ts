import type { NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { getObjectBytes } from "@/lib/r2";
import { getOwnedImage } from "@/lib/sketchImages";

/**
 * The picture itself, for the canvas. It goes through here (not a presigned bucket URL) so a sketch left open
 * never holds an expired link, and only the owner can load it. The browser may keep it: a library picture's file
 * never changes.
 */
export function GET(req: NextRequest, ctx: RouteContext<"/api/sketch-images/[id]/file">) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    const { id } = await ctx.params;
    const doc = await getOwnedImage(session.userId, id);
    const bytes = await getObjectBytes(doc.r2Key);
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": doc.mimeType,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}
