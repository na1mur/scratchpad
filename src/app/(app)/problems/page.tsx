import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchXIcon } from "lucide-react";
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Problems</h1>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? "problem" : "problems"}
            {isFiltered && " matching"}
          </p>
        </div>
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <Suspense>
            <ProblemSearch />
          </Suspense>
          <Link href="/problems/new" className={buttonVariants()}>
            <PlusIcon /> Add new
          </Link>
        </div>
      </div>

      {tags.length > 0 && (
        <nav aria-label="Filter by tag" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
          {[undefined, ...tags].map((tag) => {
            const active = query.tag === tag;
            return (
              <Link
                key={tag ?? "all"}
                href={hrefWith({ tag, q: query.q })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {tag ?? "All"}
              </Link>
            );
          })}
        </nav>
      )}

      {items.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <ProblemCard key={p.id} problem={p} />
          ))}
        </div>
      ) : isFiltered ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <SearchXIcon className="size-6 text-muted-foreground" />
          <p className="font-medium">No problems match</p>
          <Link href="/problems" className="text-sm text-muted-foreground underline underline-offset-4">
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed py-16 text-center">
          <p className="font-medium">No problems yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Add a problem you&apos;re stuck on, then paste your approach and watch it run.
          </p>
          <Link href="/problems/new" className={buttonVariants({ variant: "outline" })}>
            <PlusIcon /> Add your first problem
          </Link>
        </div>
      )}

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex items-center justify-center gap-2">
          <Link
            href={hrefWith({ ...query, page: page - 1 })}
            aria-disabled={page <= 1}
            className={cn(buttonVariants({ variant: "ghost" }), page <= 1 && "pointer-events-none opacity-50")}
          >
            <ChevronLeftIcon /> Previous
          </Link>
          <span className="text-sm text-muted-foreground">
            Page {page} of {pageCount}
          </span>
          <Link
            href={hrefWith({ ...query, page: page + 1 })}
            aria-disabled={page >= pageCount}
            className={cn(buttonVariants({ variant: "ghost" }), page >= pageCount && "pointer-events-none opacity-50")}
          >
            Next <ChevronRightIcon />
          </Link>
        </nav>
      )}
    </main>
  );
}
