import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, NotebookPenIcon, PlusIcon, SearchXIcon } from "lucide-react";
import { cn } from "cn";
import { ProblemCard } from "@/components/problems/problem-card";
import { ProblemSearch } from "@/components/problems/problem-search";
import { buttonVariants } from "@/components/ui/button";
import { requirePageSession } from "@/lib/auth/session";
import { distinctTags, listProblems } from "@/lib/problems";
import { listProblemsQuerySchema } from "@/lib/schemas/problems";

export const metadata: Metadata = { title: "Problems" };

function hrefWith(base: { tag?: string; q?: string; page?: number }) {
  const params = new URLSearchParams();
  if (base.tag) params.set("tag", base.tag);
  if (base.q) params.set("q", base.q);
  if (base.page && base.page > 1) params.set("page", String(base.page));
  const qs = params.toString();
  return qs ? `/problems?${qs}` : "/problems";
}

export default async function ProblemsPage({ searchParams }: PageProps<"/problems">) {
  const session = await requirePageSession();
  const raw = await searchParams;
  const query = listProblemsQuerySchema.parse({
    page: raw.page,
    tag: raw.tag,
    q: typeof raw.q === "string" && raw.q.trim() ? raw.q : undefined,
  });
  const [{ items, page, pageCount, total }, tags] = await Promise.all([
    listProblems(session.userId, query),
    distinctTags(session.userId),
  ]);
  const isFiltered = Boolean(query.tag || query.q);
  const now = new Date().getTime();

  return (
    <div className="flex-1 bg-paper">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {isFiltered ? (
                <>
                  {total} {total === 1 ? "problem" : "problems"}
                  {query.q && (
                    <>
                      {" "}
                      matching <span className="font-medium text-foreground">&ldquo;{query.q}&rdquo;</span>
                    </>
                  )}
                  {query.tag && (
                    <>
                      {" "}
                      tagged <span className="font-medium text-foreground">{query.tag}</span>
                    </>
                  )}
                </>
              ) : total > 0 ? (
                `${total} ${total === 1 ? "problem" : "problems"}, most recently worked on first`
              ) : (
                "Your saved problems will show up here"
              )}
            </p>
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <Suspense fallback={<div className="h-8 flex-1 rounded-lg border bg-muted/40 sm:w-72 sm:flex-none" />}>
              <ProblemSearch />
            </Suspense>
            <Link href="/problems/new" className={cn(buttonVariants({ variant: "brand" }), "shrink-0")}>
              <PlusIcon /> Add problem
            </Link>
          </div>
        </div>

        {tags.length > 0 && (
          <nav
            aria-label="Filter by tag"
            className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {[undefined, ...tags].map((tag) => {
              const active = query.tag === tag;
              return (
                <Link
                  key={tag ?? "all"}
                  href={hrefWith({ tag, q: query.q })}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand/50",
                    active
                      ? "border-brand bg-brand font-medium text-brand-foreground"
                      : "bg-sheet text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                  )}
                >
                  {tag ?? "All"}
                </Link>
              );
            })}
          </nav>
        )}

        {items.length > 0 ? (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <li key={p.id} className="grid">
                <ProblemCard problem={p} now={now} />
              </li>
            ))}
          </ul>
        ) : isFiltered ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
            <SearchXIcon className="size-6 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1">
              <p className="font-medium">Nothing matches that</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {query.q && query.tag
                  ? "Try a different word, or look at every tag."
                  : query.q
                    ? "Try a different word, or search for part of the title."
                    : "None of your problems have this tag yet."}
              </p>
            </div>
            <Link href="/problems" className={buttonVariants({ variant: "soft" })}>
              Clear filters
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed bg-plate py-16 text-center">
            <span className="flex size-10 items-center justify-center rounded-full bg-brand-soft text-brand-strong">
              <NotebookPenIcon className="size-5" aria-hidden />
            </span>
            <div className="flex flex-col gap-1">
              <p className="font-medium">No problems yet</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Add a problem you&apos;re stuck on, then paste your approach and watch it run.
              </p>
            </div>
            <Link href="/problems/new" className={buttonVariants({ variant: "brand" })}>
              <PlusIcon /> Add your first problem
            </Link>
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
            {page > 1 ? (
              <Link href={hrefWith({ ...query, page: page - 1 })} className={buttonVariants({ variant: "soft" })}>
                <ChevronLeftIcon /> Previous
              </Link>
            ) : (
              <span className={cn(buttonVariants({ variant: "soft" }), "pointer-events-none opacity-50")} aria-hidden>
                <ChevronLeftIcon /> Previous
              </span>
            )}
            <span className="min-w-24 text-center text-sm text-muted-foreground" aria-current="page">
              Page {page} of {pageCount}
            </span>
            {page < pageCount ? (
              <Link href={hrefWith({ ...query, page: page + 1 })} className={buttonVariants({ variant: "soft" })}>
                Next <ChevronRightIcon />
              </Link>
            ) : (
              <span className={cn(buttonVariants({ variant: "soft" }), "pointer-events-none opacity-50")} aria-hidden>
                Next <ChevronRightIcon />
              </span>
            )}
          </nav>
        )}
      </main>
    </div>
  );
}
