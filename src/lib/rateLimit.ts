import "server-only";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSeconds: number };

/** Swap the implementation for Redis later without touching call sites. */
export interface RateLimiter {
  consume(key: string): Promise<RateLimitResult>;
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

  private sweep(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}

const globalForLimiters = globalThis as unknown as { __limiters?: Record<string, RateLimiter> };
const limiters = (globalForLimiters.__limiters ??= {});

function limiter(name: string, limit: number, windowMs: number): RateLimiter {
  return (limiters[name] ??= new MemoryRateLimiter(limit, windowMs));
}

export const rateLimits = {
  login: () => limiter("login", 10, 15 * 60_000),
  signup: () => limiter("signup", 10, 60 * 60_000),
  // Emails sent per address: one a minute, a handful an hour. Keyed by address
  // alone so the answer doesn't depend on whether an account exists.
  otpCooldown: () => limiter("otpCooldown", 1, 60_000),
  otpHourly: () => limiter("otpHourly", 6, 60 * 60_000),
  otpVerify: () => limiter("otpVerify", 20, 15 * 60_000),
  attempts: () => limiter("attempts", 10, 60 * 60_000),
  messages: () => limiter("messages", 30, 60 * 60_000),
  solutions: () => limiter("solutions", 6, 60 * 60_000),
  providerProbe: () => limiter("providerProbe", 30, 15 * 60_000),
  uploads: () => limiter("uploads", 30, 60 * 60_000),
};
