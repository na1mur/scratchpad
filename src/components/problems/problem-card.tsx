import Link from "next/link";
import { RepeatIcon } from "lucide-react";
import { DeleteProblemButton } from "@/components/problems/delete-problem-button";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Badge } from "@/components/ui/badge";
import type { ProblemSummary } from "@/lib/problems";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

export function ProblemCard({ problem }: { problem: ProblemSummary }) {
  // The title link stretches over the whole card (a button can't live inside a link),
  // and the delete button sits above it.
  return (
    <div className="group relative flex flex-col gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/40 has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50">
      <div className="flex items-start justify-between gap-3">
        <h2 className="line-clamp-2 font-medium group-hover:underline group-hover:underline-offset-4">
          <Link href={`/problems/${problem.id}`} className="outline-none after:absolute after:inset-0 after:rounded-xl">
            {problem.title}
          </Link>
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
      <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <RepeatIcon className="size-3" />
          {problem.attemptCount} {problem.attemptCount === 1 ? "attempt" : "attempts"}
        </span>
        <span className="flex items-center gap-1">
          <time dateTime={problem.updatedAt}>{dateFormat.format(new Date(problem.updatedAt))}</time>
          <DeleteProblemButton
            problem={problem}
            className="relative z-10 -my-1 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
          />
        </span>
      </div>
    </div>
  );
}
