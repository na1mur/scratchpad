import { NextResponse, type NextRequest } from "next/server";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { homeFor } from "@/lib/auth/routes";
import { refreshAccessCookie } from "@/lib/auth/tokens";
import { encrypt, last4 } from "@/lib/crypto";
import { rateLimits } from "@/lib/rateLimit";
import { providerSettingsSchema } from "@/lib/schemas/settings";
import { publicUser } from "@/lib/serializers";
import { checkTavilyKey, type SearchUsage } from "@/lib/tavily";
import { loadUser, resolveApiKey } from "@/lib/users";
import { User, type UserDoc } from "@/models/User";

type AiSettings = NonNullable<UserDoc["ai"]>;
type SearchSettings = NonNullable<UserDoc["search"]>;

export function PUT(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const input = await parseJson(req, providerSettingsSchema);
    const user = await loadUser(session);

    // Re-entering a key replaces it; leaving it blank keeps the stored one.
    const mainKey = resolveApiKey(user, input.provider, input.apiKey);
    const ai: AiSettings = {
      provider: input.provider,
      model: input.model,
      apiKey: encrypt(mainKey),
      keyLast4: last4(mainKey),
    };

    const vision = input.vision;
    if (vision.mode === "same") {
      ai.vision = { provider: input.provider, model: input.model };
    } else if (vision.mode === "custom") {
      if (vision.provider === input.provider && !vision.apiKey) {
        ai.vision = { provider: vision.provider, model: vision.model };
      } else {
        const visionKey = resolveApiKey(user, vision.provider, vision.apiKey);
        ai.vision = {
          provider: vision.provider,
          model: vision.model,
          apiKey: encrypt(visionKey),
          keyLast4: last4(visionKey),
        };
      }
    }

    // A newly entered search key is checked with Tavily before it's stored; a saved one was checked when it was entered.
    let search: SearchSettings | undefined = user.search ?? undefined;
    let searchUsage: SearchUsage | null = null;
    if (input.search.apiKey) {
      const limit = await rateLimits.providerProbe().consume(session.userId);
      if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
      searchUsage = await checkTavilyKey(input.search.apiKey);
      search = { enabled: input.search.enabled, apiKey: encrypt(input.search.apiKey), keyLast4: last4(input.search.apiKey) };
    } else if (input.search.enabled && !user.search?.apiKey) {
      throw new ApiError(400, "key_required", "Enter your Tavily API key to turn on web search.");
    } else if (search) {
      // Turning it off keeps the key, so turning it back on doesn't need it again.
      search = { ...search, enabled: input.search.enabled };
    }

    const onboardingStep = user.onboardingStep === "provider" ? "done" : user.onboardingStep;
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { ai, onboardingStep, ...(search && { search }) } },
      { returnDocument: "after" },
    ).lean();

    const res = NextResponse.json({ user: publicUser(updated!), redirectTo: homeFor(onboardingStep), searchUsage });
    if (onboardingStep !== session.onboardingStep) {
      await refreshAccessCookie(res, session.userId, onboardingStep);
    }
    return res;
  });
}
