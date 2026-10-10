import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { listModels } from "@/lib/ai/models";
import { rateLimits } from "@/lib/rateLimit";
import { modelsQuerySchema } from "@/lib/schemas/settings";
import { clearKeyRejected, markKeyRejected } from "@/lib/providerKeys";
import { loadUser, resolveKey } from "@/lib/users";

// POST rather than GET so the key travels in the body, not in a URL that
// could end up in logs.
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const limit = await rateLimits.providerProbe().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");

    const { provider, apiKey, keyId } = await parseJson(req, modelsQuerySchema);
    const user = await loadUser(session);
    const resolved = await resolveKey(user, provider, { apiKey, keyId });
    try {
      const listing = await listModels(provider, resolved.key);
      // A fallback listing doesn't prove the key works, so only a live one clears an earlier refusal.
      if (listing.source === "live") await clearKeyRejected(resolved.keyId);
      return NextResponse.json(listing);
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_key") await markKeyRejected(resolved.keyId);
      throw err;
    }
  });
}
