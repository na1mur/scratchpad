import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Workspace } from "@/components/workspace/Workspace";
import { ApiError } from "@/lib/api";
import { getOwnedAttempt, serializeAttempt, serializeAttemptSummary } from "@/lib/attempts";
import { requirePageSession } from "@/lib/auth/session";
import { ensureProblemHarness, needsHarness } from "@/lib/harness/build";
import { getOwnedProblemBySlug, serializeProblem } from "@/lib/problems";
import { r2Enabled } from "@/lib/r2";
import { toursSeenBy } from "@/lib/tours";
import { getPageUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";
import { Solution } from "@/models/Solution";

async function loadProblem(slug: string) {
  const session = await requirePageSession();
  try {
    return await getOwnedProblemBySlug(session.userId, slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[slug]">): Promise<Metadata> {
  const problem = await loadProblem((await params).slug);
  return { title: problem.title };
}

export default async function WorkspacePage({ params }: PageProps<"/problems/[slug]">) {
  const problem = await loadProblem((await params).slug);
  // Problems from before harnesses (or whose build failed a while ago) get one while the learner reads.
  if (needsHarness(problem.harness)) after(() => ensureProblemHarness(problem._id));
  const user = await getPageUser();
  const userId = String(user._id);
  const attempts = await Attempt.find({ problemId: problem._id, userId })
    .sort({ version: -1 })
    .select({ version: 1, status: 1, createdAt: 1, "vizSpec.summary.verdict": 1 })
    .lean();
  const hasSolution = Boolean(await Solution.exists({ problemId: problem._id, userId, status: { $ne: "error" } }));
  const latest = attempts[0] ? await serializeAttempt(await getOwnedAttempt(userId, String(attempts[0]._id))) : null;
  const summaries = attempts.map(serializeAttemptSummary);
  // The detail load may have just marked a stale run as failed.
  if (latest && summaries[0]) summaries[0] = { ...summaries[0], status: latest.status };

  return (
    <Workspace
      problem={serializeProblem(problem)}
      initialAttempts={summaries}
      initialAttempt={latest}
      aiModel={user.ai ? { provider: user.ai.provider, model: user.ai.model, hasKey: Boolean(user.ai.apiKey) } : null}
      uploadsEnabled={r2Enabled}
      hasSolution={hasSolution}
      chatLayout={user.preferences?.chatLayout ?? "inline"}
      toursSeen={toursSeenBy(user)}
    />
  );
}
