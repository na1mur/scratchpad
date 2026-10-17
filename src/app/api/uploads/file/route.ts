import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, objectIdSchema, parseWith, requireUser } from "@/lib/api";
import { readImageUpload } from "@/lib/image-upload";
import { getOwnedProblem } from "@/lib/problems";
import { rateLimits } from "@/lib/rateLimit";
import { EXTENSIONS, MAX_IMAGE_BYTES } from "@/lib/schemas/uploads";
import { putObject, storageEnabled, viewUrl } from "@/lib/storage";

/** Stores a notebook photo for one of the user's problems and returns its key and view URL. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!storageEnabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const { form, bytes, type } = await readImageUpload(req, MAX_IMAGE_BYTES);
    const problemId = parseWith(objectIdSchema, form.get("problemId"));
    await getOwnedProblem(session.userId, problemId);
    const limit = await rateLimits.uploads().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many uploads. Try again later.");

    const key = `users/${session.userId}/problems/${problemId}/${randomUUID()}.${EXTENSIONS[type]}`;
    await putObject(key, bytes);
    return NextResponse.json({ key, viewUrl: viewUrl(key), mimeType: type });
  });
}
