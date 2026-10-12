"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShieldCheckIcon, ShieldOffIcon } from "lucide-react";
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
import type { Role } from "@/models/User";

/** Promotes a user to admin or demotes an admin, after a confirmation. */
export function RoleButton({ id, label, role }: { id: string; label: string; role: Role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const next: Role = role === "admin" ? "user" : "admin";
  const action = next === "admin" ? "Make admin" : "Make user";

  async function onConfirm() {
    setSaving(true);
    try {
      await api(`/api/admin/users/${id}/role`, { method: "PATCH", body: { role: next } });
      toast.success(next === "admin" ? `${label} is now an admin` : `${label} is now a regular user`);
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't change the role.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button variant="outline" size="xs" onClick={() => setOpen(true)} aria-label={`${action}: ${label}`}>
        {next === "admin" ? <ShieldCheckIcon /> : <ShieldOffIcon />}
        {action}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && !saving && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{next === "admin" ? `Make ${label} an admin?` : `Make ${label} a regular user?`}</DialogTitle>
            <DialogDescription>
              {next === "admin"
                ? "They'll see every user and their usage, and can promote or demote other admins."
                : "They'll lose access to the admin dashboard straight away."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <LoadingButton variant={next === "admin" ? "default" : "destructive"} onClick={onConfirm} loading={saving}>
              {saving ? "Saving…" : action}
            </LoadingButton>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
