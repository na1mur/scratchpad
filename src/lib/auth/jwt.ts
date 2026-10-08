import { SignJWT, jwtVerify } from "jose";
import { env } from "@/lib/env";
import type { OnboardingStep } from "@/models/User";

export const ACCESS_TTL_SECONDS = env.ACCESS_TOKEN_TTL;
export const REFRESH_TTL_SECONDS = env.REFRESH_TOKEN_TTL;

const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const ISSUER = "dsabuddy";

export type AccessPayload = { sub: string; onboardingStep: OnboardingStep };
export type RefreshPayload = { sub: string; jti: string; family: string };

export function signAccessToken(payload: AccessPayload): Promise<string> {
  return new SignJWT({ onboardingStep: payload.onboardingStep })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_SECONDS}s`)
    .sign(accessKey);
}

export function signRefreshToken(payload: RefreshPayload): Promise<string> {
  return new SignJWT({ family: payload.family })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setJti(payload.jti)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${REFRESH_TTL_SECONDS}s`)
    .sign(refreshKey);
}

/** Returns null for any invalid, expired or malformed token. */
export async function verifyAccessToken(token: string | undefined): Promise<AccessPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, accessKey, { issuer: ISSUER, algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.onboardingStep !== "string") return null;
    return { sub: payload.sub, onboardingStep: payload.onboardingStep as OnboardingStep };
  } catch {
    return null;
  }
}

export async function verifyRefreshToken(token: string | undefined): Promise<RefreshPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, refreshKey, { issuer: ISSUER, algorithms: ["HS256"] });
    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      typeof payload.family !== "string"
    ) {
      return null;
    }
    return { sub: payload.sub, jti: payload.jti, family: payload.family };
  } catch {
    return null;
  }
}
