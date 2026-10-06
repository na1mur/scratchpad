import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { homeFor } from "@/lib/auth/routes";
import { refreshAccessCookie } from "@/lib/auth/tokens";
import { encrypt, last4 } from "@/lib/crypto";
import { providerSettingsSchema } from "@/lib/schemas/settings";
import { publicUser } from "@/lib/serializers";
import { loadUser, resolveApiKey } from "@/lib/users";
import { User, type UserDoc } from "@/models/User";

type AiSettings = NonNullable<UserDoc["ai"]>;

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

    const onboardingStep = user.onboardingStep === "provider" ? "done" : user.onboardingStep;
    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { ai, onboardingStep } },
      { returnDocument: "after" },
    ).lean();

    const res = NextResponse.json({ user: publicUser(updated!), redirectTo: homeFor(onboardingStep) });
    if (onboardingStep !== session.onboardingStep) {
      await refreshAccessCookie(res, session.userId, onboardingStep);
    }
    return res;
  });
}
