"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightIcon, GitForkIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { buttonVariants } from "@/components/ui/button";
import { rememberPendingFork, takePendingFork } from "@/components/share/pending-fork";
import { ApiClientError, api } from "@/lib/fetcher";
import type { ProblemDetail } from "@/lib/problems";
import { problemPath } from "@/lib/slug";

export type SharedViewer = "guest" | "onboarding" | "member" | "owner";

/**
 * Copies the shared problem into the visitor's own list and opens it. A visitor who isn't signed in (or
 * hasn't finished onboarding) is sent to do that first, and the fork happens on its own once they're in.
 */
export function ForkButton({ token, viewer, ownerSlug }: { token: string; viewer: SharedViewer; ownerSlug: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);

  if (viewer === "owner") {
    return (
      <Link href={problemPath({ slug: ownerSlug })} className={buttonVariants({ variant: "soft" })}>
        Open in your workspace <ArrowRightIcon />
      </Link>
    );
  }

  async function fork() {
    // Kept until the fork goes through, so a session that turns out to be expired picks it up after login.
    rememberPendingFork(token);
    if (viewer === "guest") {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (viewer === "onboarding") {
      // The proxy sends them to the onboarding step they're on; the app finishes the fork afterwards.
      router.push("/problems");
      return;
    }
    setBusy(true);
    try {
      const { problem } = await api<{ problem: ProblemDetail }>(`/api/shared/${encodeURIComponent(token)}/fork`, {
        method: "POST",
      });
      takePendingFork();
      toast.success(`Forked “${problem.title}”. Now write your approach.`);
      router.push(problemPath(problem));
    } catch (err) {
      // A 401 has already sent them to log in, with the fork still pending.
      if (!(err instanceof ApiClientError && err.status === 401)) {
        takePendingFork();
        toast.error(err instanceof Error ? err.message : "Couldn't fork this problem.");
      }
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <LoadingButton variant="brand" loading={busy} icon={<GitForkIcon />} onClick={fork}>
        {busy ? "Forking…" : "Fork this problem"}
      </LoadingButton>
      <p className="text-xs text-muted-foreground">
        {viewer === "guest"
          ? "Log in or sign up first; it's added to your list right after."
          : "Adds the problem to your list, to solve your own way."}
      </p>
    </div>
  );
}
