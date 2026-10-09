"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SettingsIcon } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Shown next to failed runs, since a different model often fixes them. By default
 * it opens Settings in the same tab and Settings sends the learner back here once
 * they've saved. `newTab` is for a draft that isn't saved anywhere (it would be
 * lost by leaving), and has no way back to return to.
 */
export function ChangeModelLink({ newTab, className }: { newTab?: boolean; className?: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const href = newTab ? "/settings" : `/settings?returnTo=${encodeURIComponent(pathname + (search ? `?${search}` : ""))}`;
  return (
    <Link
      href={href}
      {...(newTab ? { target: "_blank", rel: "noopener" } : {})}
      className={buttonVariants({ variant: "outline", className })}
    >
      <SettingsIcon /> Change model in Settings
    </Link>
  );
}
