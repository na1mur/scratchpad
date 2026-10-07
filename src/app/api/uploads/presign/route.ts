import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { getOwnedProblem } from "@/lib/problems";
import { presignPut, r2Enabled, viewUrl } from "@/lib/r2";
import { rateLimits } from "@/lib/rateLimit";
import { EXTENSIONS, presignSchema } from "@/lib/schemas/uploads";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const { problemId, mimeType, size } = await parseJson(req, presignSchema);
    await getOwnedProblem(session.userId, problemId);
    const limit = await rateLimits.uploads().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many uploads. Try again later.");

    const key = `users/${session.userId}/problems/${problemId}/${randomUUID()}.${EXTENSIONS[mimeType]}`;
    const [uploadUrl, publicUrl] = await Promise.all([presignPut(key, mimeType, size), viewUrl(key)]);
    return NextResponse.json({ key, uploadUrl, viewUrl: publicUrl, headers: { "Content-Type": mimeType } });
  });
}
