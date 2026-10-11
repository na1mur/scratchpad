"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { takePendingFork } from "@/components/share/pending-fork";
import { api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { problemPath } from "@/lib/slug";

/**
 * Finishes a fork a visitor asked for before they were signed in: mounted wherever a signed-in, onboarded
 * user can land after logging in, signing up or onboarding. Renders nothing.
 */
export function PendingForkRunner() {
  const router = useRouter();
  useEffect(() => {
    const token = takePendingFork();
    if (!token) return;
    const id = toast.loading("Adding the problem to your list…");
    api<{ problem: ProblemDetail }>(`/api/shared/${encodeURIComponent(token)}/fork`, { method: "POST" })
      .then(({ problem }) => {
        toast.success(`Forked “${problem.title}”. Now write your approach.`, { id });
        router.replace(problemPath(problem));
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't fork that problem.", { id }));
  }, [router]);
  return null;
}
