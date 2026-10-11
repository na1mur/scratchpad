import Link from "next/link";
import { DeleteProblemButton } from "@/components/problems/delete-problem-button";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Badge } from "@/components/ui/badge";
import type { ProblemSummary } from "@/lib/problems";
import { problemPath } from "@/lib/slug";
import { timeAgo } from "@/lib/timeAgo";

const dateFormat = new Intl.DateTimeFormat("en", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/**
 * The table view of the problems list. As with the cards, the title link stretches over the whole row and
 * the delete button sits above it. Narrow screens drop the tag and attempt columns and fold the verdict
 * under the title.
 */
export function ProblemTable({ problems, now }: { problems: ProblemSummary[]; now: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-plate">
      <table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-2 font-medium">
              Problem
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
              Topics
            </th>
            <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
              Last result
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium md:table-cell">
              Attempts
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium whitespace-nowrap">
              Updated
            </th>
            <th scope="col" className="w-10 py-2 pr-2">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {problems.map((p) => (
            <tr
              key={p.id}
              className="group relative transition-colors hover:bg-muted/40 has-[a:focus-visible]:bg-muted/40"
            >
              <td className="px-4 py-3">
                <Link
                  href={problemPath(p)}
                  className="line-clamp-2 font-medium outline-none after:absolute after:inset-0 focus-visible:underline"
                >
                  {p.title}
                </Link>
                <VerdictBadge verdict={p.lastVerdict} className="mt-1.5 sm:hidden" />
              </td>
              <td className="hidden px-3 py-3 md:table-cell">
                {p.tags.length > 0 ? (
                  <ul className="flex flex-wrap gap-1" aria-label="Topics">
                    {p.tags.slice(0, 2).map((t) => (
                      <li key={t}>
                        <Badge variant="secondary">{t}</Badge>
                      </li>
                    ))}
                    {p.tags.length > 2 && (
                      <li>
                        <Badge variant="outline" title={p.tags.slice(2).join(", ")}>
                          +{p.tags.length - 2}
                        </Badge>
                      </li>
                    )}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
              <td className="hidden px-3 py-3 sm:table-cell">
                <VerdictBadge verdict={p.lastVerdict} />
              </td>
              <td className="hidden px-3 py-3 text-right text-muted-foreground tabular-nums md:table-cell">
                {p.attemptCount}
              </td>
              <td className="px-3 py-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                <time dateTime={p.updatedAt} title={dateFormat.format(new Date(p.updatedAt))}>
                  {timeAgo(p.updatedAt, now)}
                </time>
              </td>
              <td className="py-3 pr-2 text-right">
                <DeleteProblemButton
                  problem={p}
                  className="relative z-10 hover:bg-destructive/10 pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100 pointer-fine:focus-visible:opacity-100"
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
