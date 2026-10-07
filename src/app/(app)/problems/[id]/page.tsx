import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Workspace } from "@/components/workspace/Workspace";
import { ApiError } from "@/lib/api";
import { getOwnedAttempt, serializeAttempt, serializeAttemptSummary } from "@/lib/attempts";
import { requirePageSession } from "@/lib/auth/session";
import { getOwnedProblem, serializeProblem } from "@/lib/problems";
import { r2Enabled } from "@/lib/r2";
import { getPageUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";

async function loadProblem(id: string) {
  const session = await requirePageSession();
  try {
    return await getOwnedProblem(session.userId, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[id]">): Promise<Metadata> {
  const problem = await loadProblem((await params).id);
  return { title: problem.title };
}

export default async function WorkspacePage({ params }: PageProps<"/problems/[id]">) {
  const problem = await loadProblem((await params).id);
  const user = await getPageUser();
  const userId = String(user._id);
  const attempts = await Attempt.find({ problemId: problem._id, userId })
    .sort({ version: -1 })
    .select({ version: 1, status: 1, createdAt: 1, "vizSpec.summary.verdict": 1 })
    .lean();
  const latest = attempts[0] ? await serializeAttempt(await getOwnedAttempt(userId, String(attempts[0]._id))) : null;
  const summaries = attempts.map(serializeAttemptSummary);
  // The detail load may have just marked a stale run as failed.
  if (latest && summaries[0]) summaries[0] = { ...summaries[0], status: latest.status };

  return (
    <Workspace
      problem={serializeProblem(problem)}
      initialAttempts={summaries}
      initialAttempt={latest}
      aiModel={user.ai ? { provider: user.ai.provider, model: user.ai.model } : null}
      uploadsEnabled={r2Enabled}
    />
  );
}
