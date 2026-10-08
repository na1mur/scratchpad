"use client";

import { CoinsIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { AttemptDetail } from "@/lib/attempts";
import { PROVIDER_LABELS } from "@/lib/providers";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const full = new Intl.NumberFormat("en");

/** Tokens spent on this attempt (pipeline, regenerations and chat), billed to the learner's own key. */
export function UsageBadge({ attempt }: { attempt: AttemptDetail }) {
  const usage = attempt.tokenUsage;
  if (!usage || usage.totalTokens === 0) return null;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="flex cursor-default items-center gap-1 text-xs text-muted-foreground tabular-nums" tabIndex={0} />
        }
      >
        <CoinsIcon className="size-3.5" />
        {compact.format(usage.totalTokens)} tokens
      </TooltipTrigger>
      <TooltipContent className="flex flex-col items-start gap-0.5 bg-popover px-3 py-2 text-left text-xs text-popover-foreground shadow-md ring-1 ring-foreground/10 [&>div]:hidden">
        {attempt.model && (
          <span>
            {PROVIDER_LABELS[attempt.model.provider]} · {attempt.model.model}
          </span>
        )}
        <span>Input: {full.format(usage.inputTokens)}</span>
        <span>Output: {full.format(usage.outputTokens)}</span>
        {attempt.traceMode && (
          <span>{attempt.traceMode === "execution" ? "Traced by running your logic in a sandbox" : "Traced by model simulation"}</span>
        )}
        <span className="text-muted-foreground">Billed to your own API key at your provider&apos;s rates.</span>
      </TooltipContent>
    </Tooltip>
  );
}
