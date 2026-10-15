import Link from "next/link";
import { VerdictBadge } from "@/components/problems/verdict-badge";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProblemSummary } from "@/lib/problems";
import { problemPath } from "@/lib/slug";
import { timeAgo } from "@/lib/timeAgo";

const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

/** The problems the learner worked on last, as a table; each title opens the problem. */
export function RecentProblems({ problems, now }: { problems: ProblemSummary[]; now: number }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent problems</CardTitle>
        <CardDescription>
          {problems.length > 0 ? "The ones you tried last." : "Problems you try will show up here."}
        </CardDescription>
        <CardAction>
          <Link href="/problems" className={buttonVariants({ variant: "outline", size: "sm" })}>
            {problems.length > 0 ? "All problems" : "Add a problem"}
          </Link>
        </CardAction>
      </CardHeader>
      {problems.length > 0 && (
        <CardContent>
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Problem
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium md:table-cell">
                  Topics
                </th>
                <th scope="col" className="hidden px-3 py-2 font-medium sm:table-cell">
                  Last result
                </th>
                <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
                  Attempts
                </th>
                <th scope="col" className="py-2 pl-3 text-right font-medium whitespace-nowrap">
                  Last tried
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {problems.map((p) => (
                <tr
                  key={p.id}
                  className="group relative transition-colors hover:bg-muted/40 has-[a:focus-visible]:bg-muted/40"
                >
                  <td className="py-3 pr-3">
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
                  <td className="hidden px-3 py-3 text-right text-muted-foreground tabular-nums sm:table-cell">
                    {p.attemptCount}
                  </td>
                  <td className="py-3 pl-3 text-right text-xs whitespace-nowrap text-muted-foreground">
                    <time dateTime={p.updatedAt} title={dateFormat.format(new Date(p.updatedAt))}>
                      {timeAgo(p.updatedAt, now)}
                    </time>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      )}
    </Card>
  );
}
