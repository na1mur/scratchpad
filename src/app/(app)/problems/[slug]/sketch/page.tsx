import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SketchView } from "@/components/sketch/SketchView";
import { ApiError } from "@/lib/api";
import { requirePageSession } from "@/lib/auth/session";
import { getOwnedProblemBySlug, serializeProblem } from "@/lib/problems";
import { loadSketch } from "@/lib/sketches";
import { getPageUser } from "@/lib/users";

async function load(slug: string) {
  const session = await requirePageSession();
  try {
    return { session, problem: await getOwnedProblemBySlug(session.userId, slug) };
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[slug]/sketch">): Promise<Metadata> {
  const { problem } = await load((await params).slug);
  return { title: `Sketch · ${problem.title}` };
}

export default async function SketchPage({ params }: PageProps<"/problems/[slug]/sketch">) {
  const { session, problem } = await load((await params).slug);
  const [elements, user] = await Promise.all([loadSketch(session.userId, problem._id), getPageUser()]);
  return (
    <SketchView
      key={problem._id.toString()}
      problem={serializeProblem(problem)}
      initialElements={elements}
      initialGrid={user.preferences?.sketchGrid ?? false}
    />
  );
}
