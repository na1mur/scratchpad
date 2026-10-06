"use client";

import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export async function logout(router: ReturnType<typeof useRouter>) {
  const res = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  if (!res.ok) {
    toast.error("Couldn't log out. Try again.");
    return;
  }
  router.replace("/login");
  router.refresh();
}

export function LogoutButton({ withLabel }: { withLabel?: boolean }) {
  const router = useRouter();
  return (
    <Button variant="ghost" size={withLabel ? "default" : "icon"} aria-label="Log out" onClick={() => logout(router)}>
      <LogOutIcon />
      {withLabel && "Log out"}
    </Button>
  );
}
