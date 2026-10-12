"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { WrenchIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/fetcher";
import type { SolutionSummary } from "@/lib/solutions";
import { problemPath } from "@/lib/slug";

/**
 * Asks for a solution built from this attempt: its own approach, fixed. It becomes a new solution version
 * even when the problem has others; an attempt that already has one opens that instead.
 */
export function FixAttemptButton({
  problemId,
  problemSlug,
  attempt,
  canGenerate,
  disabled,
}: {
  problemId: string;
  problemSlug: string;
  attempt: { id: string; version: number };
  /** False when no AI provider is set up. */
  canGenerate: boolean;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  async function onConfirm() {
    setStarting(true);
    try {
      const { solution } = await api<{ solution: SolutionSummary }>(`/api/problems/${problemId}/solutions`, {
        method: "POST",
        body: { kind: "from_attempt", attemptId: attempt.id },
      });
      router.push(`${problemPath({ slug: problemSlug })}/solution?v=${solution.version}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start the solution.");
      setStarting(false);
    }
  }

  return (
    <>
      <Button variant="soft" size="sm" disabled={disabled || !canGenerate} onClick={() => setOpen(true)}>
        <WrenchIcon /> Fix this attempt
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !starting && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>See attempt v{attempt.version} fixed?</DialogTitle>
            <DialogDescription>
              If you&apos;re close, the last fix is often the part worth finding yourself, and once you&apos;ve seen it you
              can&apos;t unsee it. The hints might be enough to get you there.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-inside list-disc flex-col gap-1 text-sm text-muted-foreground marker:text-brand-strong">
            <li>It keeps your approach and names, and changes only what&apos;s broken, saying what and why.</li>
            <li>If the approach itself can&apos;t work, you get the closest one that does.</li>
            <li>It&apos;s saved as a new solution version, next to any you already have.</li>
          </ul>
          <DialogFooter>
            <LoadingButton variant="outline" onClick={onConfirm} loading={starting}>
              {starting ? "Starting…" : "Show me the fix"}
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
