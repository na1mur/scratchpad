import { cn } from "cn";
import { VERDICT_LABELS, type Verdict } from "@/lib/verdicts";

const TONE: Record<Verdict, string> = {
  works: "bg-viz-success/15 text-viz-success border-viz-success/30",
  fails: "bg-viz-error/15 text-viz-error border-viz-error/30",
  partially_works: "bg-viz-compare/15 text-viz-compare border-viz-compare/30",
  unclear: "bg-muted text-muted-foreground border-border",
};

export function VerdictBadge({ verdict, className }: { verdict: Verdict | null; className?: string }) {
  if (!verdict) {
    return <span className={cn("text-xs text-muted-foreground", className)}>No attempts yet</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        TONE[verdict],
        className,
      )}
    >
      {VERDICT_LABELS[verdict]}
    </span>
  );
}
