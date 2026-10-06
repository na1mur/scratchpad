import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { listModels } from "@/lib/ai/models";
import { rateLimits } from "@/lib/rateLimit";
import { modelsQuerySchema } from "@/lib/schemas/settings";
import { loadUser, resolveApiKey } from "@/lib/users";

// POST rather than GET so the key travels in the body, not in a URL that
// could end up in logs.
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const limit = await rateLimits.providerProbe().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");

    const { provider, apiKey } = await parseJson(req, modelsQuerySchema);
    const user = await loadUser(session);
    const listing = await listModels(provider, resolveApiKey(user, provider, apiKey));
    return NextResponse.json(listing);
  });
}
