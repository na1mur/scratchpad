import { NextResponse, type NextRequest } from "next/server";
import { handle, parseJson, requireUser } from "@/lib/api";
import { homeFor } from "@/lib/auth/routes";
import { refreshAccessCookie } from "@/lib/auth/tokens";
import { languageSchema } from "@/lib/schemas/settings";
import { publicUser } from "@/lib/serializers";
import { loadUser } from "@/lib/users";
import { User } from "@/models/User";

export function PATCH(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const { language } = await parseJson(req, languageSchema);
    const user = await loadUser(session);
    const onboardingStep = user.onboardingStep === "language" ? "provider" : user.onboardingStep;

    const updated = await User.findByIdAndUpdate(
      user._id,
      { $set: { preferredLanguage: language, onboardingStep } },
      { returnDocument: "after" },
    ).lean();

    const res = NextResponse.json({ user: publicUser(updated!), redirectTo: homeFor(onboardingStep) });
    if (onboardingStep !== session.onboardingStep) {
      await refreshAccessCookie(res, session.userId, onboardingStep);
    }
    return res;
  });
}
