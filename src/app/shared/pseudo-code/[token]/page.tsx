import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedAttemptView } from "@/components/share/shared-attempt-view";
import { loadSharedAttempt } from "@/lib/shares";
import { sharedViewer } from "../../viewer";

const load = cache(loadSharedAttempt);

export async function generateMetadata({ params }: PageProps<"/shared/pseudo-code/[token]">): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `Pseudo-code · ${data.problem.title}` : "Not shared",
    robots: { index: false, follow: false },
  };
}

/** Public: anyone with the link sees it while it's shared, signed in or not. */
export default async function SharedAttemptPage({ params }: PageProps<"/shared/pseudo-code/[token]">) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  const viewer = await sharedViewer(data.ownerId);
  return (
    <SharedAttemptView
      token={token}
      viewer={viewer}
      // The owner's own slug is only useful (and only sent) to the owner.
      data={{ problem: data.problem, attempt: data.attempt, ownerSlug: viewer === "owner" ? data.ownerSlug : "" }}
    />
  );
}
