"use client";

import Link from "next/link";
import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <TriangleAlertIcon className="size-8 text-viz-error" />
      <div>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          The page hit an unexpected error. Your work is saved; try again, or head back to your problems.
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={reset}>
          <RotateCcwIcon /> Try again
        </Button>
        <Link href="/problems" className={buttonVariants({ variant: "outline" })}>
          Back to problems
        </Link>
      </div>
    </main>
  );
}
