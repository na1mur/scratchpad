import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LessonView } from "@/components/lesson/LessonView";
import { ApiError } from "@/lib/api";
import { requirePageSession } from "@/lib/auth/session";
import { getProblemLesson, serializeLesson } from "@/lib/lessons";
import { getOwnedProblemBySlug, serializeProblem } from "@/lib/problems";
import { getPageUser } from "@/lib/users";

async function loadProblem(slug: string) {
  const session = await requirePageSession();
  try {
    return await getOwnedProblemBySlug(session.userId, slug);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[slug]/breakdown">): Promise<Metadata> {
  const problem = await loadProblem((await params).slug);
  return { title: `Breakdown · ${problem.title}` };
}

/** The problem's breakdown: its lesson, under the name learners see. */
export default async function BreakdownPage({ params }: PageProps<"/problems/[slug]/breakdown">) {
  const problem = await loadProblem((await params).slug);
  const user = await getPageUser();
  const lesson = await getProblemLesson(String(user._id), problem._id);

  return (
    <LessonView
      key={problem._id.toString()}
      problem={serializeProblem(problem)}
      initialLesson={lesson && (await serializeLesson(lesson))}
      canGenerate={Boolean(user.ai?.apiKey)}
    />
  );
}
