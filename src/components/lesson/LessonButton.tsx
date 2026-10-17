"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PresentationIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { buttonVariants } from "@/components/ui/button";
import { api } from "@/lib/fetcher";
import { problemPath } from "@/lib/slug";

const LOOK = { variant: "marker", className: "shadow-sm ring-3 ring-marker/35 hover:ring-marker/55" } as const;
const TITLE = "Slides that break the problem down: how to think about it, with animated pictures and no code";

/** "Breakdown": opens the problem's lesson, starting to build it first when there isn't one yet. */
export function LessonButton({
  problemId,
  problemSlug,
  hasLesson,
  canGenerate,
}: {
  problemId: string;
  problemSlug: string;
  hasLesson: boolean;
  /** False when no AI provider (or key) is set up. */
  canGenerate: boolean;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const href = `${problemPath({ slug: problemSlug })}/breakdown`;

  if (hasLesson) {
    return (
      <Link href={href} className={buttonVariants(LOOK)} title={TITLE}>
        <PresentationIcon /> Breakdown
      </Link>
    );
  }

  async function onClick() {
    setStarting(true);
    try {
      await api(`/api/problems/${problemId}/lesson`, { method: "POST" });
      router.push(href);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the breakdown.");
      setStarting(false);
    }
  }

  return (
    <LoadingButton {...LOOK} icon={<PresentationIcon />} loading={starting} disabled={!canGenerate} title={TITLE} onClick={() => void onClick()}>
      Breakdown
    </LoadingButton>
  );
}
