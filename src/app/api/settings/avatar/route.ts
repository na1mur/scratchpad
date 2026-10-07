import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, requireUser } from "@/lib/api";
import { avatarKeyPrefix, resolveAvatarUrl } from "@/lib/avatar";
import { connectDB } from "@/lib/db";
import { readImageUpload } from "@/lib/image-upload";
import { deleteKeys, putObject, r2Enabled } from "@/lib/r2";
import { rateLimits } from "@/lib/rateLimit";
import { EXTENSIONS, MAX_AVATAR_BYTES } from "@/lib/schemas/uploads";
import { User } from "@/models/User";

// Best effort: an orphaned object is harmless and the DB is the source of truth.
const discard = (key: string | null | undefined) =>
  key
    ? deleteKeys([key]).catch((err) => console.error("[avatar] cleanup failed:", err instanceof Error ? err.message : err))
    : Promise.resolve();

/** Stores the posted image in R2 as the user's avatar and removes the previous one. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    if (!r2Enabled) throw new ApiError(503, "uploads_disabled", "Image uploads aren't configured on this server.");
    const limit = await rateLimits.uploads().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many uploads. Try again later.");

    const { bytes, type } = await readImageUpload(req, MAX_AVATAR_BYTES);

    const key = `${avatarKeyPrefix(session.userId)}${randomUUID()}.${EXTENSIONS[type]}`;
    await putObject(key, bytes, type);

    await connectDB();
    const before = await User.findByIdAndUpdate(session.userId, { $set: { avatarKey: key } }, { returnDocument: "before" })
      .select("avatarKey")
      .lean();
    await discard(before?.avatarKey);

    return NextResponse.json({ avatarUrl: await resolveAvatarUrl({ avatarKey: key, googlePicture: undefined }) });
  });
}

/** Drops the uploaded photo, falling back to the Google picture (or the default icon). */
export function DELETE(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser({ onboarded: true });
    await connectDB();
    const before = await User.findByIdAndUpdate(session.userId, { $unset: { avatarKey: 1 } }, { returnDocument: "before" })
      .select("avatarKey googlePicture")
      .lean();
    await discard(before?.avatarKey);
    return NextResponse.json({ avatarUrl: before?.googlePicture ?? null });
  });
}
