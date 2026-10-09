import "server-only";
import { ApiError } from "@/lib/api";
import { decrypt } from "@/lib/crypto";
import type { UserDoc } from "@/models/User";

/**
 * Web search runs on the learner's own Tavily key (free monthly credits, no
 * card), never on one of ours. This holds the key check used when it's saved
 * and the lookup of a user's key for a run.
 */

/** A user's search key, with whose it is so a refusal only pauses their searches. */
export type SearchKey = { owner: string; key: string };

/** The key to search with, or null when the user hasn't turned web search on. */
export function userSearchKey(user: Pick<UserDoc, "_id" | "search">): SearchKey | null {
  if (!user.search?.enabled || !user.search.apiKey) return null;
  return { owner: String(user._id), key: decrypt(user.search.apiKey) };
}

export type SearchUsage = { used: number; limit: number | null };

type UsageBody = {
  key?: { usage?: number; limit?: number | null };
  account?: { plan_usage?: number; plan_limit?: number | null };
};

/**
 * Checks a key against Tavily's usage endpoint, which doesn't spend a search
 * credit. Throws a friendly ApiError for a refused key; returns this month's
 * credits so the learner can see what's left.
 */
export async function checkTavilyKey(key: string): Promise<SearchUsage> {
  let res: Response;
  try {
    // api.tavily.com is a fixed public host, so a plain fetch is fine here.
    res = await fetch("https://api.tavily.com/usage", {
      headers: { authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw new ApiError(502, "search_unreachable", "Couldn't reach Tavily to check the key. Try again in a moment.");
  }
  if (res.status === 401 || res.status === 403) {
    throw new ApiError(400, "search_key_invalid", "Tavily didn't accept that API key. Check it and try again.");
  }
  if (res.status === 429) {
    throw new ApiError(429, "rate_limited", "Tavily is rate-limiting this key. Try again in a minute.");
  }
  if (!res.ok) throw new ApiError(502, "search_unreachable", `Tavily couldn't check the key (${res.status}).`);

  const body = (await res.json().catch(() => ({}))) as UsageBody;
  // The account's monthly plan is what runs out on the free tier; fall back to the key's own numbers.
  return {
    used: body.account?.plan_usage ?? body.key?.usage ?? 0,
    limit: body.account?.plan_limit ?? body.key?.limit ?? null,
  };
}
