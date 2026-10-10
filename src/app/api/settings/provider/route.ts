import { NextResponse, type NextRequest } from "next/server";
import { listModels } from "@/lib/ai/models";
import { ApiError, handle, parseJson, requireUser } from "@/lib/api";
import { homeFor } from "@/lib/auth/routes";
import { refreshAccessCookie } from "@/lib/auth/tokens";
import { encrypt, last4 } from "@/lib/crypto";
import { backfillSavedKeys, clearKeyRejected, markKeyRejected, saveKey, touchKeys } from "@/lib/providerKeys";
import type { KeyProviderId, ProviderId } from "@/lib/providers";
import { rateLimits } from "@/lib/rateLimit";
import { providerSettingsSchema } from "@/lib/schemas/settings";
import { publicUser } from "@/lib/serializers";
import { checkTavilyKey, type SearchUsage } from "@/lib/tavily";
import { loadUser, resolveKey } from "@/lib/users";
import { User, type UserDoc } from "@/models/User";

type AiSettings = NonNullable<UserDoc["ai"]>;
type SearchSettings = NonNullable<UserDoc["search"]>;

/** Lists models with a new key, which spends nothing; "unknown" when the provider couldn't be asked. */
async function probeKey(provider: ProviderId, key: string): Promise<"ok" | "rejected" | "unknown"> {
  try {
    return (await listModels(provider, key)).source === "live" ? "ok" : "unknown";
  } catch (err) {
    return err instanceof ApiError && err.code === "invalid_key" ? "rejected" : "unknown";
  }
}

export function PUT(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const input = await parseJson(req, providerSettingsSchema);
    // Keys stored before saved keys existed get an entry first, so every slot below ends up with a keyId.
    const user = await backfillSavedKeys(await loadUser(session));

    // AI keys the provider refused while saving. They're saved and used anyway, flagged: some keys can
    // run models but not list them, so a refusal here doesn't prove the key is useless.
    const rejected: ProviderId[] = [];
    let probed = false;

    /** The key for one slot: typed keys are checked and saved, picked ones are marked as just used. */
    const slotKey = async (provider: KeyProviderId, input: { apiKey?: string; keyId?: string; keyNote?: string }) => {
      const resolved = await resolveKey(user, provider, input);
      if (!resolved.typed) return { apiKey: encrypt(resolved.key), keyLast4: last4(resolved.key), keyId: resolved.keyId };
      const saved = await saveKey(user._id, provider, resolved.key, input.keyNote);
      if (provider !== "tavily") {
        if (!probed) {
          probed = true;
          const limit = await rateLimits.providerProbe().consume(session.userId);
          if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
        }
        const verdict = await probeKey(provider, resolved.key);
        if (verdict === "rejected") {
          await markKeyRejected(saved._id);
          rejected.push(provider);
        } else if (verdict === "ok") {
          await clearKeyRejected(saved._id);
        }
      }
      return { apiKey: encrypt(resolved.key), keyLast4: last4(resolved.key), keyId: saved._id };
    };

    // Re-entering a key replaces it; leaving it blank keeps the stored one.
    const ai: AiSettings = { provider: input.provider, model: input.model, ...(await slotKey(input.provider, input)) };

    const vision = input.vision;
    if (vision.mode === "same") {
      ai.vision = { provider: input.provider, model: input.model };
    } else if (vision.mode === "custom") {
      if (vision.provider === input.provider && !vision.apiKey && !vision.keyId) {
        ai.vision = { provider: vision.provider, model: vision.model };
      } else {
        ai.vision = { provider: vision.provider, model: vision.model, ...(await slotKey(vision.provider, vision)) };
      }
    }

    // A newly entered search key is checked with Tavily before it's stored; a saved one was checked when it was entered.
    let search: SearchSettings | undefined = user.search ?? undefined;
    let searchUsage: SearchUsage | null = null;
    if (input.search.apiKey) {
      const limit = await rateLimits.providerProbe().consume(session.userId);
      if (!limit.ok) throw new ApiError(429, "rate_limited", "Too many requests. Try again shortly.");
      searchUsage = await checkTavilyKey(input.search.apiKey);
      search = { enabled: input.search.enabled, ...(await slotKey("tavily", input.search)) };
    } else if (input.search.keyId) {
      search = { enabled: input.search.enabled, ...(await slotKey("tavily", input.search)) };
    } else if (input.search.enabled && !user.search?.apiKey) {
      throw new ApiError(400, "key_required", "Enter your Tavily API key to turn on web search.");
    } else if (search) {
      // Turning it off keeps the key, so turning it back on doesn't need it again.
      search = { ...search, enabled: input.search.enabled };
    }
    await touchKeys([ai.keyId, ai.vision?.keyId, search?.enabled ? search.keyId : null]);

    const onboardingStep = user.onboardingStep === "provider" ? "done" : user.onboardingStep;
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { ai, onboardingStep, ...(search && { search }) } },
      { returnDocument: "after" },
    ).lean();

    const res = NextResponse.json({
      user: publicUser(updated!),
      redirectTo: homeFor(onboardingStep),
      searchUsage,
      rejected: [...new Set(rejected)],
    });
    if (onboardingStep !== session.onboardingStep) {
      await refreshAccessCookie(res, session.userId, onboardingStep);
    }
    return res;
  });
}
