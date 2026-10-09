"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const SECONDS = 5;

/** After saving, counts down and sends the learner back to the page that sent them to Settings. */
export function ReturnCountdown({ returnTo, onStay }: { returnTo: string; onStay: () => void }) {
  const router = useRouter();
  const [left, setLeft] = useState(SECONDS);

  useEffect(() => {
    if (left <= 0) {
      router.push(returnTo);
      return;
    }
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left, returnTo, router]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand bg-brand-soft p-4 sm:flex-row sm:items-center sm:justify-between">
      {/* Announced once; the ticking number below is hidden from screen readers. */}
      <p role="status" className="text-sm">
        <span className="font-medium">Saved.</span> Taking you back to where you left off
        <span aria-hidden> in {left}…</span>
        <span className="sr-only"> in a few seconds.</span>
      </p>
      <div className="flex shrink-0 gap-2">
        <Button type="button" variant="brand" onClick={() => router.push(returnTo)}>
          <ArrowLeftIcon /> Go back now
        </Button>
        <Button type="button" variant="outline" onClick={onStay}>
          Stay in Settings
        </Button>
      </div>
    </div>
  );
}
