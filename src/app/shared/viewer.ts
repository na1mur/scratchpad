import "server-only";
import type { SharedViewer } from "@/components/share/fork-button";
import { getSession } from "@/lib/auth/session";

/** Who is looking at a shared page, which decides what the fork button does. */
export async function sharedViewer(ownerId: string): Promise<SharedViewer> {
  const session = await getSession();
  if (!session) return "guest";
  if (session.userId === ownerId) return "owner";
  return session.onboardingStep === "done" ? "member" : "onboarding";
}
