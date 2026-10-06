import { NextResponse, type NextRequest } from "next/server";
import { generateText } from "ai";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { toFriendlyProviderError } from "@/lib/ai/errors";
import { createModel } from "@/lib/ai/providers";
import { rateLimits } from "@/lib/rateLimit";
import { testConnectionSchema } from "@/lib/schemas/settings";
import { loadUser, resolveApiKey } from "@/lib/users";

export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const limit = await rateLimits.providerProbe().consume(session.userId);
    if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");

    const { provider, apiKey, model } = await parseJson(req, testConnectionSchema);
    const user = await loadUser(session);
    const key = resolveApiKey(user, provider, apiKey);

    const started = Date.now();
    try {
      await generateText({
        model: createModel(provider, key, model),
        prompt: "Reply with the single word: ok",
        maxOutputTokens: 64,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      throw toFriendlyProviderError(err);
    }
    return NextResponse.json({ ok: true, latencyMs: Date.now() - started });
  });
}
