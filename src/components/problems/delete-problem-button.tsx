"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
import { cn } from "cn";
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
import type { ProblemSummary } from "@/lib/problems";

export function DeleteProblemButton({
  problem,
  className,
}: {
  problem: Pick<ProblemSummary, "id" | "title" | "attemptCount">;
  className?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await api(`/api/problems/${problem.id}`, { method: "DELETE" });
      toast.success("Problem deleted");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Delete ${problem.title}`}
        title="Delete problem"
        className={cn("text-muted-foreground hover:text-destructive", className)}
        onClick={() => setOpen(true)}
      >
        <Trash2Icon />
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && !deleting && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &ldquo;{problem.title}&rdquo;?</DialogTitle>
            <DialogDescription>
              This removes the problem, all {problem.attemptCount} attempt{problem.attemptCount === 1 ? "" : "s"}, their
              visualizations, chats and uploaded photos. It can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <LoadingButton variant="destructive" onClick={onDelete} loading={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
