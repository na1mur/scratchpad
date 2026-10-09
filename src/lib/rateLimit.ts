import "server-only";
import { env } from "@/lib/env";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/** Swap the implementation for Redis later without touching call sites. */
export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
  /** Gives back one use, for work that failed and so shouldn't count against the limit. */
  refund(key: string): Promise<void>;
}

/** Fixed-window counter held in process memory. Fine for a single instance. */
class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private limit: number,
    private windowMs: number,
  ) {}

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    if (this.hits.size > 10_000) this.sweep(now);
    let entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs };
      this.hits.set(key, entry);
    }
    entry.count++;
    return {
      ok: entry.count <= this.limit,
      remaining: Math.max(0, this.limit - entry.count),
      retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000),
    };
  }

  async refund(key: string): Promise<void> {
    const entry = this.hits.get(key);
    // A window that has already rolled over has nothing of this use left to give back.
    if (entry && entry.resetAt > Date.now() && entry.count > 0) entry.count--;
  }

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

const globalForLimiters = globalThis as unknown as { __limiters?: Record<string, RateLimiter> };
const limiters = (globalForLimiters.__limiters ??= {});

function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  return (limiters[name] ??= new MemoryRateLimiter(limit, windowMs));
}

/** A cap set from the environment, where 0 means no limit. */
const configured = (name: string, perHour: number) => limiter(name, perHour === 0 ? Infinity : perHour, 60 * 60_000);

export const rateLimits = {
  login: () => limiter("login", 10, 15 * 60_000),
  signup: () => limiter("signup", 10, 60 * 60_000),
  // Emails sent per address: one a minute, a handful an hour. Keyed by address
  // alone so the answer doesn't depend on whether an account exists.
  otpCooldown: () => limiter("otpCooldown", 1, 60_000),
  otpHourly: () => limiter("otpHourly", 6, 60 * 60_000),
  otpVerify: () => limiter("otpVerify", 20, 15 * 60_000),
  // The three caps below come from RATE_LIMIT_*_PER_HOUR (see .env.example).
  attempts: () => configured("attempts", env.RATE_LIMIT_ATTEMPTS_PER_HOUR),
  messages: () => configured("messages", env.RATE_LIMIT_MESSAGES_PER_HOUR),
  solutions: () => configured("solutions", env.RATE_LIMIT_SOLUTIONS_PER_HOUR),
  providerProbe: () => limiter("providerProbe", 30, 15 * 60_000),
  uploads: () => limiter("uploads", 30, 60 * 60_000),
};
