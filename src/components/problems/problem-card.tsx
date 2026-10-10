import Link from "next/link";
import { RepeatIcon } from "lucide-react";
import { DeleteProblemButton } from "@/components/problems/delete-problem-button";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Badge } from "@/components/ui/badge";
import type { ProblemSummary } from "@/lib/problems";
import { timeAgo } from "@/lib/timeAgo";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export function ProblemCard({ problem, now }: { problem: ProblemSummary; now: number }) {
  // The title link stretches over the whole card (a button can't live inside a link),
  // and the delete button sits above it.
  const noAttempts = problem.attemptCount === 0;
  return (
    <div className="group relative flex min-h-36 flex-col gap-3 rounded-xl border bg-plate p-4 transition-colors hover:border-foreground/30 has-[a:focus-visible]:border-foreground/40 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <h2 className="line-clamp-2 text-base leading-snug font-medium text-balance">
        <Link href={`/problems/${problem.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
          {problem.title}
        </Link>
      </h2>
      {problem.tags.length > 0 && (
        <ul className="flex flex-wrap gap-1" aria-label="Topics">
          {problem.tags.slice(0, 3).map((t) => (
            <li key={t}>
              <Badge variant="secondary">{t}</Badge>
            </li>
          ))}
          {problem.tags.length > 3 && (
            <li>
              <Badge variant="outline" title={problem.tags.slice(3).join(", ")}>
                +{problem.tags.length - 3}
              </Badge>
            </li>
          )}
        </ul>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-2">
          {problem.lastVerdict ? (
            <VerdictBadge verdict={problem.lastVerdict} className="shrink-0" />
          ) : (
            <span>No attempts yet</span>
          )}
          {!noAttempts && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <RepeatIcon className="size-3" aria-hidden />
              {problem.attemptCount} {problem.attemptCount === 1 ? "attempt" : "attempts"}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1">
          <time dateTime={problem.updatedAt} title={dateFormat.format(new Date(problem.updatedAt))}>
            {timeAgo(problem.updatedAt, now)}
          </time>
          <DeleteProblemButton
            problem={problem}
            className="relative z-10 -my-1 -mr-1 hover:bg-destructive/10 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
          />
        </span>
      </div>
    </div>
  );
}
