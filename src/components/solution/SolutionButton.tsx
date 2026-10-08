"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LightbulbIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiClientError, api } from "@/lib/fetcher";

/**
 * Opens the problem's solutions. Before the first one exists it asks whether
 * the learner wants one more try, since a solution can't be unseen.
 */
export function SolutionButton({
  problemId,
  hasSolution,
  attempt,
  canGenerate,
  disabled,
}: {
  problemId: string;
  hasSolution: boolean;
  /** The analysed attempt the first solution should build on. */
  attempt: { id: string; version: number } | null;
  /** False when no AI provider is set up. */
  canGenerate: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const href = `/problems/${problemId}/solution`;
  // Filled brand with a soft halo, so it reads as the way out when stuck rather than another small control.
  const look = "shadow-sm ring-3 ring-brand/25 hover:ring-brand/40";

  if (hasSolution) {
    return (
      <Link href={href} className={buttonVariants({ variant: "brand", className: look })}>
        <LightbulbIcon /> View solution
      </Link>
    );
  }

  async function onConfirm() {
    setStarting(true);
    try {
      await api(`/api/problems/${problemId}/solutions`, {
        method: "POST",
        body: { kind: "initial", ...(attempt && { attemptId: attempt.id }) },
      });
      router.push(href);
    } catch (err) {
      // Someone (another tab) got there first: the page shows that one.
      if (err instanceof ApiClientError && (err.code === "exists" || err.code === "in_progress")) {
        router.push(href);
        return;
      }
      toast.error(err instanceof Error ? err.message : "Couldn't start the solution.");
      setStarting(false);
    }
  }

  return (
    <>
      <Button variant="brand" className={look} disabled={disabled || !canGenerate} onClick={() => setOpen(true)}>
        <LightbulbIcon /> Solution
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !starting && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>See the solution now?</DialogTitle>
            <DialogDescription>
              The struggle is where most of the learning happens, and once you&apos;ve seen the answer you can&apos;t
              unsee it. If you haven&apos;t yet, read the hints and try one more attempt first.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-inside list-disc flex-col gap-1 text-sm text-muted-foreground marker:text-brand-strong">
            <li>
              {attempt
                ? `It builds on your attempt v${attempt.version}: what carries over, and what had to change.`
                : "You haven't analysed an attempt yet, so it won't be tailored to your approach."}
            </li>
            <li>You get the code, a line-by-line breakdown and a step-by-step walkthrough.</li>
            <li>It&apos;s saved, so opening it again later won&apos;t cost anything.</li>
          </ul>
          <DialogFooter>
            <LoadingButton variant="outline" onClick={onConfirm} loading={starting}>
              {starting ? "Starting…" : "Show me the solution"}
            </LoadingButton>
            <Button variant="brand" onClick={() => setOpen(false)} disabled={starting}>
              I&apos;ll try once more
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
