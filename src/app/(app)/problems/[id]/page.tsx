import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";
import { requirePageSession } from "@/lib/auth/session";
import { getOwnedProblem, serializeProblem } from "@/lib/problems";

async function load(id: string) {
  const session = await requirePageSession();
  try {
    return serializeProblem(await getOwnedProblem(session.userId, id));
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
}

export async function generateMetadata({ params }: PageProps<"/problems/[id]">): Promise<Metadata> {
  const problem = await load((await params).id);
  return { title: problem.title };
}

export default async function WorkspacePage({ params }: PageProps<"/problems/[id]">) {
  const problem = await load((await params).id);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{problem.title}</h1>
      <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm">{problem.statement}</pre>
    </main>
  );
}
