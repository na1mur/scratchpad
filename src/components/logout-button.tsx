"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { LoadingButton } from "@/components/loading-button";

/** Logout with a pending flag, so every trigger can disable itself and show progress. */
export function useLogout() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function logout() {
    if (pending) return;
    setPending(true);
    // A toast too, since a menu item closes before it could show a spinner.
    toast.loading("Logging out…", { id: "logout" });
    try {
      const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) throw new Error();
      toast.success("Logged out. See you soon!", { id: "logout" });
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Couldn't log out. Try again.", { id: "logout" });
      setPending(false);
    }
  }
  return { logout, pending };
}

export function LogoutButton({ withLabel }: { withLabel?: boolean }) {
  const { logout, pending } = useLogout();
  return (
    <LoadingButton
      variant="ghost"
      size={withLabel ? "default" : "icon"}
      aria-label="Log out"
      loading={pending}
      icon={<LogOutIcon />}
      onClick={logout}
    >
      {withLabel && (pending ? "Logging out…" : "Log out")}
    </LoadingButton>
  );
}
