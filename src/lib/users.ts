import "server-only";
import type { Types } from "mongoose";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requirePageSession, type Session } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { connectDB } from "@/lib/db";
import { getSavedKey } from "@/lib/providerKeys";
import type { KeyProviderId } from "@/lib/providers";
import { User, type UserDoc } from "@/models/User";

export async function loadUser(session: Session): Promise<UserDoc> {
  await connectDB();
  const user = await User.findById(session.userId).lean();
  if (!user) throw new ApiError(401, "unauthorized", "Please log in.");
  return user;
}

export type ResolvedKey = {
  key: string;
  /** The saved key it came from; absent for a key typed into the form, which the caller saves. */
  keyId?: Types.ObjectId;
  typed: boolean;
};

/**
 * A key typed into the form wins, then the saved key the form picked. Otherwise reuse the key stored on
 * the user for the same provider, so a request that names neither still works.
 */
export async function resolveKey(
  user: UserDoc,
  provider: KeyProviderId,
  input: { apiKey?: string; keyId?: string },
): Promise<ResolvedKey> {
  if (input.apiKey) return { key: input.apiKey, typed: true };
  if (input.keyId) {
    const saved = await getSavedKey(user._id, input.keyId, provider);
    return { key: decrypt(saved.apiKey), keyId: saved._id, typed: false };
  }
  const stored =
    provider === "tavily"
      ? user.search
      : user.ai?.provider === provider
        ? user.ai
        : user.ai?.vision?.provider === provider
          ? user.ai.vision
          : null;
  if (stored?.apiKey) return { key: decrypt(stored.apiKey), keyId: stored.keyId ?? undefined, typed: false };
  throw new ApiError(400, "key_required", "Enter an API key for this provider.");
}

/** For server components. The proxy has already checked the session. */
export async function getPageUser(): Promise<UserDoc> {
  const session = await requirePageSession();
  await connectDB();
  const user = await User.findById(session.userId).lean();
  // A valid token for a deleted user: clear the session, or /login would bounce back here.
  if (!user) redirect("/api/auth/logout");
  return user;
}
