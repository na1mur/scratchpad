import Link from "next/link";
import { RepeatIcon } from "lucide-react";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Badge } from "@/components/ui/badge";
import type { ProblemSummary } from "@/lib/problems";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export function ProblemCard({ problem }: { problem: ProblemSummary }) {
  return (
    <Link
      href={`/problems/${problem.id}`}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 font-medium group-hover:underline group-hover:underline-offset-4">
          {problem.title}
        </h2>
        <VerdictBadge verdict={problem.lastVerdict} className="shrink-0" />
      </div>
      {problem.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {problem.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
          {problem.tags.length > 4 && <Badge variant="outline">+{problem.tags.length - 4}</Badge>}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <RepeatIcon className="size-3" />
          {problem.attemptCount} {problem.attemptCount === 1 ? "attempt" : "attempts"}
        </span>
        <time dateTime={problem.updatedAt}>{dateFormat.format(new Date(problem.updatedAt))}</time>
      </div>
    </Link>
  );
}
