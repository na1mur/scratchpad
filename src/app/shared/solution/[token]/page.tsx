import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SharedSolutionView } from "@/components/share/shared-solution-view";
import { loadSharedSolution } from "@/lib/shares";
import { sharedViewer } from "../../viewer";

const load = cache(loadSharedSolution);

export async function generateMetadata({ params }: PageProps<"/shared/solution/[token]">): Promise<Metadata> {
  const data = await load((await params).token);
  return {
    title: data ? `Solution · ${data.problem.title}` : "Not shared",
    robots: { index: false, follow: false },
  };
}

/** Public: anyone with the link sees it while it's shared, signed in or not. */
export default async function SharedSolutionPage({ params }: PageProps<"/shared/solution/[token]">) {
  const { token } = await params;
  const data = await load(token);
  if (!data) notFound();
  const viewer = await sharedViewer(data.ownerId);
  return (
    <SharedSolutionView
      token={token}
      viewer={viewer}
      // The owner's own slug is only useful (and only sent) to the owner.
      data={{ problem: data.problem, solution: data.solution, ownerSlug: viewer === "owner" ? data.ownerSlug : "" }}
    />
  );
}
