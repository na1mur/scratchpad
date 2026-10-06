import "server-only";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requirePageSession, type Session } from "@/lib/auth/session";
import { decrypt } from "@/lib/crypto";
import { connectDB } from "@/lib/db";
import type { ProviderId } from "@/lib/providers";
import { User, type UserDoc } from "@/models/User";

export async function loadUser(session: Session): Promise<UserDoc> {
  await connectDB();
  const user = await User.findById(session.userId).lean();
  if (!user) throw new ApiError(401, "unauthorized", "Please log in.");
  return user;
}

/**
 * A key typed into the form wins. Otherwise reuse a stored key for the same
 * provider, so editing settings doesn't force re-entering the key.
 */
export function resolveApiKey(user: UserDoc, provider: ProviderId, apiKey?: string): string {
  if (apiKey) return apiKey;
  if (user.ai?.provider === provider) return decrypt(user.ai.apiKey);
  if (user.ai?.vision?.provider === provider && user.ai.vision.apiKey) return decrypt(user.ai.vision.apiKey);
  throw new ApiError(400, "key_required", "Enter an API key for this provider.");
}

/** For server components. The proxy has already checked the session. */
export async function getPageUser(): Promise<UserDoc> {
  const session = await requirePageSession();
  await connectDB();
  const user = await User.findById(session.userId).lean();
  if (!user) redirect("/login");
  return user;
}
