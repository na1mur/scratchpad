import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { connectDB } from "@/lib/db";
import {
  REFRESH_TTL_SECONDS,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "@/lib/auth/jwt";
import { RefreshToken } from "@/models/RefreshToken";
import { User, type OnboardingStep } from "@/models/User";

// Two requests racing to refresh with the same token (e.g. parallel fetches
// right after the access token expired) are not theft. Inside this window the
// loser is told to retry instead of having its whole family revoked.
const CONCURRENT_REFRESH_GRACE_MS = 10_000;

export type TokenPair = { access: string; refresh: string };

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function createRefreshToken(userId: string, family: string) {
  const jti = randomUUID();
  const refresh = await signRefreshToken({ sub: userId, jti, family });
  await RefreshToken.create({
    userId,
    jti,
    tokenHash: sha256(refresh),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return { refresh, jti };
}

/** Starts a new token family (login / signup). */
export async function issueTokenPair(userId: string, onboardingStep: OnboardingStep): Promise<TokenPair> {
  await connectDB();
  const { refresh } = await createRefreshToken(userId, randomUUID());
  const access = await signAccessToken({ sub: userId, onboardingStep });
  return { access, refresh };
}

export type RotateResult =
  | { ok: true; tokens: TokenPair; userId: string; onboardingStep: OnboardingStep }
  | { ok: false; reason: "invalid" | "reused" | "concurrent" };

export async function rotateRefreshToken(rawToken: string | undefined): Promise<RotateResult> {
  const payload = await verifyRefreshToken(rawToken);
  if (!payload || !rawToken) return { ok: false, reason: "invalid" };
  await connectDB();

  const tokenHash = sha256(rawToken);
  // Atomically claim the token so only one request can rotate it.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing) return { ok: false, reason: "invalid" };
    const revokedAgo = Date.now() - (existing.revokedAt?.getTime() ?? 0);
    if (existing.replacedBy && revokedAgo < CONCURRENT_REFRESH_GRACE_MS) {
      return { ok: false, reason: "concurrent" };
    }
    // A revoked token was presented again: assume it was stolen.
    await revokeFamily(existing.family);
    return { ok: false, reason: "reused" };
  }

  const user = await User.findById(claimed.userId, { onboardingStep: 1 }).lean();
  if (!user) {
    await revokeFamily(claimed.family);
    return { ok: false, reason: "invalid" };
  }

  const userId = String(claimed.userId);
  const { refresh, jti } = await createRefreshToken(userId, claimed.family);
  await RefreshToken.updateOne({ _id: claimed._id }, { $set: { replacedBy: jti } });
  const access = await signAccessToken({ sub: userId, onboardingStep: user.onboardingStep });
  return { ok: true, tokens: { access, refresh }, userId, onboardingStep: user.onboardingStep };
}

export async function revokeFamily(family: string) {
  await connectDB();
  await RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Logout: revoke the family the presented refresh token belongs to. */
export async function revokeByRawToken(rawToken: string | undefined) {
  const payload = await verifyRefreshToken(rawToken);
  if (!payload) return;
  await revokeFamily(payload.family);
}
