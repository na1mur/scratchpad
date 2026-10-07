import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, objectIdSchema, parseWith, requireUser } from "@/lib/api";
import { readImageUpload } from "@/lib/image-upload";
import { getOwnedProblem } from "@/lib/problems";
import { putObject, r2Enabled, viewUrl } from "@/lib/r2";
import { rateLimits } from "@/lib/rateLimit";
import { EXTENSIONS, MAX_IMAGE_BYTES } from "@/lib/schemas/uploads";

/** Stores a notebook photo for one of the user's problems in R2 and returns its key and public URL. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const { form, bytes, type } = await readImageUpload(req, MAX_IMAGE_BYTES);
    const problemId = parseWith(objectIdSchema, form.get("problemId"));
    await getOwnedProblem(session.userId, problemId);
    const limit = await rateLimits.uploads().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many uploads. Try again later.");

    const key = `users/${session.userId}/problems/${problemId}/${randomUUID()}.${EXTENSIONS[type]}`;
    await putObject(key, bytes, type);
    return NextResponse.json({ key, viewUrl: await viewUrl(key), mimeType: type });
  });
}
