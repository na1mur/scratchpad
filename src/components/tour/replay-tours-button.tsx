"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CompassIcon } from "lucide-react";
import { LoadingButton } from "@/components/loading-button";
import { api } from "@/lib/fetcher";

/** Brings the first-run tours back, for a learner who dismissed them too fast or wants a refresher. */
export function ReplayToursButton() {
  const [busy, setBusy] = useState(false);

  async function replay() {
    setBusy(true);
    try {
      await api("/api/settings/tours", { method: "DELETE" });
      toast.success("Done. The guided tours will show again as you use the app.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't reset the tours.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <LoadingButton variant="outline" loading={busy} icon={<CompassIcon />} onClick={() => void replay()}>
      Replay the guided tours
    </LoadingButton>
  );
}
