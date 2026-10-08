import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SolutionView } from "@/components/solution/SolutionView";
import { ApiError } from "@/lib/api";
import { requirePageSession } from "@/lib/auth/session";
import { getOwnedProblem, serializeProblem } from "@/lib/problems";
import { SOLUTION_SUMMARY_FIELDS, getOwnedSolution, serializeSolution, serializeSolutionSummary } from "@/lib/solutions";
import { getPageUser } from "@/lib/users";
import { Attempt } from "@/models/Attempt";
import { Solution } from "@/models/Solution";

async function loadProblem(id: string) {
  const session = await requirePageSession();
  try {
    return await getOwnedProblem(session.userId, id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[id]/solution">): Promise<Metadata> {
  const problem = await loadProblem((await params).id);
  return { title: `Solution · ${problem.title}` };
}

export default async function SolutionPage({ params, searchParams }: PageProps<"/problems/[id]/solution">) {
  const problem = await loadProblem((await params).id);
  const { v } = await searchParams;
  const user = await getPageUser();
  const userId = String(user._id);

  const [solutions, baseAttempt] = await Promise.all([
    Solution.find({ problemId: problem._id, userId }).sort({ version: -1 }).select(SOLUTION_SUMMARY_FIELDS).lean(),
    Attempt.findOne({ problemId: problem._id, userId, status: "done" }).sort({ version: -1 }).select({ version: 1 }).lean(),
  ]);
  // `?v=` picks a version; otherwise the newest.
  const wanted = Number(Array.isArray(v) ? v[0] : v);
  const chosen = solutions.find((s) => s.version === wanted) ?? solutions[0];
  const detail = chosen ? await serializeSolution(await getOwnedSolution(userId, String(chosen._id))) : null;
  const summaries = solutions.map(serializeSolutionSummary);
  // The detail load may have just marked a stale run as failed.
  if (detail) {
    const i = summaries.findIndex((s) => s.id === detail.id);
    if (i >= 0) summaries[i] = { ...summaries[i], status: detail.status };
  }

  return (
    <SolutionView
      key={problem._id.toString()}
      problem={serializeProblem(problem)}
      initialSolutions={summaries}
      initialSolution={detail}
      baseAttempt={baseAttempt ? { id: String(baseAttempt._id), version: baseAttempt.version } : null}
      canGenerate={Boolean(user.ai)}
    />
  );
}
