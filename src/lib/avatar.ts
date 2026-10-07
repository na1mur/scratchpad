import "server-only";
import { r2Enabled, viewUrl } from "@/lib/r2";
import type { UserDoc } from "@/models/User";

/** Every uploaded avatar lives directly under this prefix, so a key can be checked against its owner. */
export const avatarKeyPrefix = (userId: string) => `users/${userId}/avatar/`;

/** The uploaded photo if there is one, else the Google picture, else null (the UI shows an icon). */
export async function resolveAvatarUrl(user: Pick<UserDoc, "avatarKey" | "googlePicture">): Promise<string | null> {
  if (user.avatarKey && r2Enabled) {
    try {
      return await viewUrl(user.avatarKey);
    } catch (err) {
      console.error("[avatar] couldn't build a view URL:", err instanceof Error ? err.message : err);
    }
  }
  return user.googlePicture ?? null;
}
