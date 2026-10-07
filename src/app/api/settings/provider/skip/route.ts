import { NextResponse, type NextRequest } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { homeFor } from "@/lib/auth/routes";
import { refreshAccessCookie } from "@/lib/auth/tokens";
import { publicUser } from "@/lib/serializers";
import { loadUser } from "@/lib/users";
import { User } from "@/models/User";

/** Finishes onboarding without a provider; the key can be added later in Settings. */
export function POST(req: NextRequest) {
  return handle(req, async () => {
    const session = await requireUser();
    const user = await loadUser(session);
    const onboardingStep = user.onboardingStep === "provider" ? "done" : user.onboardingStep;

    const updated =
      onboardingStep === user.onboardingStep
        ? user
        : await User.findByIdAndUpdate(user._id, { $set: { onboardingStep } }, { returnDocument: "after" }).lean();

    const res = NextResponse.json({ user: publicUser(updated!), redirectTo: homeFor(onboardingStep) });
    if (onboardingStep !== session.onboardingStep) {
      await refreshAccessCookie(res, session.userId, onboardingStep);
    }
    return res;
  });
}
