"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Trash2Icon } from "lucide-react";
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

export function DeleteAttemptButton({
  attempt,
  disabled,
  onDeleted,
}: {
  attempt: { id: string; version: number };
  disabled?: boolean;
  onDeleted: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function onDelete() {
    setDeleting(true);
    try {
      await api(`/api/attempts/${attempt.id}`, { method: "DELETE" });
      toast.success(`Attempt v${attempt.version} deleted`);
      setOpen(false);
      onDeleted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <Button
        variant="destructive"
        size="icon"
        aria-label={`Delete attempt v${attempt.version}`}
        title="Delete this attempt"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Trash2Icon />
      </Button>

      <Dialog open={open} onOpenChange={(o) => !o && !deleting && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete attempt v{attempt.version}?</DialogTitle>
            <DialogDescription>
              This removes its pseudo-code, visualizations, chat and uploaded photos. It can&apos;t be undone.
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
