import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Types } from "mongoose";
import type { NextResponse } from "next/server";
import { setAccessCookie } from "@/lib/auth/cookies";
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

async function createRefreshToken(userId: string, family: string, jti: string = randomUUID()) {
  const refresh = await signRefreshToken({ sub: userId, jti, family });
  await RefreshToken.create({
    userId,
    jti,
    tokenHash: sha256(refresh),
    family,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return refresh;
}

/** Starts a new token family (login / signup). */
export async function issueTokenPair(userId: string, onboardingStep: OnboardingStep): Promise<TokenPair> {
  await connectDB();
  const refresh = await createRefreshToken(userId, randomUUID());
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
  // Atomically claim the token so only one request can rotate it. `replacedBy`
  // is set in the same write: a racing request that sees the token revoked
  // without it would take the race for reuse and revoke the whole family.
  const jti = randomUUID();
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null },
    { $set: { revokedAt: new Date(), replacedBy: jti } },
    { returnDocument: "after" },
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash });
    if (!existing) return { ok: false, reason: "invalid" };
    const revokedAgo = Date.now() - (existing.revokedAt?.getTime() ?? 0);
    if (existing.replacedBy && revokedAgo < CONCURRENT_REFRESH_GRACE_MS) {
      return { ok: false, reason: "concurrent" };
    }
    const recovered = existing.replacedBy ? await recoverLostRotation(existing._id, existing.replacedBy) : null;
    if (recovered) return recovered;
    // A revoked token was presented again: assume it was stolen.
    await revokeFamily(existing.family);
    return { ok: false, reason: "reused" };
  }

  return issueRotation(claimed.userId, claimed.family, jti);
}

/**
 * The token was rotated, but its replacement has never been used: the response carrying it never reached
 * the browser (the tab closed, the laptop slept or the connection dropped mid-refresh), so the browser
 * still holds the old one. Rotate it again instead of logging the user out. The unused replacement is
 * revoked without a successor, so if a thief presented the old token, the real browser's next refresh
 * still kills the family. A replacement that was used means two holders, which stays theft (null).
 */
async function recoverLostRotation(id: Types.ObjectId, replacedBy: string): Promise<RotateResult | null> {
  const replacement = await RefreshToken.findOne({ jti: replacedBy }, { revokedAt: 1 }).lean();
  if (!replacement || replacement.revokedAt) return null;

  // Claim the recovery; a parallel request with the same old token loses this and waits like any race.
  const jti = randomUUID();
  const reclaimed = await RefreshToken.findOneAndUpdate(
    { _id: id, replacedBy },
    { $set: { revokedAt: new Date(), replacedBy: jti } },
    { returnDocument: "after" },
  );
  if (!reclaimed) return { ok: false, reason: "concurrent" };

  const dropped = await RefreshToken.updateOne({ jti: replacedBy, revokedAt: null }, { $set: { revokedAt: new Date() } });
  if (!dropped.modifiedCount) return null;

  return issueRotation(reclaimed.userId, reclaimed.family, jti);
}

async function issueRotation(userObjectId: Types.ObjectId, family: string, jti: string): Promise<RotateResult> {
  const user = await User.findById(userObjectId, { onboardingStep: 1 }).lean();
  if (!user) {
    await revokeFamily(family);
    return { ok: false, reason: "invalid" };
  }

  const userId = String(userObjectId);
  const refresh = await createRefreshToken(userId, family, jti);
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

/** Re-signs the access token after the user's onboarding step changes. */
export async function refreshAccessCookie(res: NextResponse, userId: string, onboardingStep: OnboardingStep) {
  setAccessCookie(res, await signAccessToken({ sub: userId, onboardingStep }));
}
