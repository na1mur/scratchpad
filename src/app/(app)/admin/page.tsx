import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon, SearchIcon, SearchXIcon } from "lucide-react";
import { z } from "zod";
import { cn } from "cn";
import { RoleButton } from "@/components/admin/role-button";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADMIN_PAGE_SIZE,
  USER_SORTS,
  getStats,
  listUsers,
  type AdminStats,
  type UserSort,
} from "@/lib/admin";
import { timeAgo } from "@/lib/timeAgo";
import { getAdminPageUser } from "@/lib/users";

export const metadata: Metadata = { title: "Admin" };

const querySchema = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(USER_SORTS).catch("joined"),
  dir: z.enum(["asc", "desc"]).catch("desc"),
  page: z.coerce.number().int().min(1).max(10_000).catch(1),
});
type Query = z.infer<typeof querySchema>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

function hrefWith(query: Query, change: Partial<Query>) {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.sort !== "joined") params.set("sort", next.sort);
  if (next.dir !== "desc") params.set("dir", next.dir);
  if (next.page > 1) params.set("page", String(next.page));
  const qs = params.toString();
  return qs ? `/admin?${qs}` : "/admin";
}

const number = new Intl.NumberFormat("en");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" });

function StatGrid({ stats }: { stats: AdminStats }) {
  const items: { label: string; value: string; note?: string }[] = [
    { label: "Users", value: number.format(stats.users), note: `+${stats.newUsers7d} in the last 7 days` },
    { label: "Active users", value: number.format(stats.active7d), note: "ran an analysis in the last 7 days" },
    { label: "Verified emails", value: number.format(stats.verifiedUsers), note: `of ${number.format(stats.users)}` },
    { label: "AI provider connected", value: number.format(stats.withProvider), note: `of ${number.format(stats.users)}` },
    { label: "Problems", value: number.format(stats.problems) },
    { label: "Attempts", value: number.format(stats.attempts) },
    { label: "Solutions", value: number.format(stats.solutions) },
    {
      label: "Failed runs",
      value: number.format(stats.failedRuns),
      note: `${compact.format(stats.tokens)} tokens used overall`,
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="flex flex-col gap-1 rounded-xl border bg-plate p-4">
          <dt className="text-xs text-muted-foreground">{s.label}</dt>
          <dd className="text-2xl font-semibold tracking-tight tabular-nums">{s.value}</dd>
          {s.note && <dd className="text-xs text-muted-foreground">{s.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

function SortHeader({
  query,
  sort,
  align = "right",
  className,
  children,
}: {
  query: Query;
  sort: UserSort;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const active = query.sort === sort;
  // First click sorts highest-first (names: A to Z); clicking again flips it.
  const firstDir = sort === "name" ? "asc" : "desc";
  const dir = active ? (query.dir === "asc" ? "desc" : "asc") : firstDir;
  const Arrow = query.dir === "asc" ? ArrowUpIcon : ArrowDownIcon;
  return (
    <th
      scope="col"
      aria-sort={active ? (query.dir === "asc" ? "ascending" : "descending") : undefined}
      className={cn("px-3 py-2 font-medium whitespace-nowrap", align === "right" ? "text-right" : "text-left", className)}
    >
      <Link
        href={hrefWith(query, { sort, dir, page: 1 })}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground focus-visible:underline",
          active && "text-foreground",
        )}
      >
        {children}
        {active && <Arrow className="size-3" aria-hidden />}
      </Link>
    </th>
  );
}

export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const admin = await getAdminPageUser();
  const raw = await searchParams;
  const query = querySchema.parse({
    q: first(raw.q) ?? "",
    sort: first(raw.sort),
    dir: first(raw.dir),
    page: first(raw.page),
  });
  const [stats, { rows, total }] = await Promise.all([getStats(), listUsers(query)]);
  const pageCount = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const now = new Date().getTime();

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">Everyone on Scratchpad, how much they use it, and who can see this page.</p>
      </div>

      <StatGrid stats={stats} />

      <section className="flex flex-col gap-4" aria-labelledby="users-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="users-heading" className="text-lg font-semibold tracking-tight">
            Users <span className="text-sm font-normal text-muted-foreground">({number.format(total)})</span>
          </h2>
          <form action="/admin" role="search" className="relative w-full sm:w-72">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              defaultValue={query.q}
              placeholder="Search by name or email"
              aria-label="Search users"
              className="pl-8"
            />
            {query.sort !== "joined" && <input type="hidden" name="sort" value={query.sort} />}
            {query.dir !== "desc" && <input type="hidden" name="dir" value={query.dir} />}
          </form>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center">
            <SearchXIcon className="size-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No users match &ldquo;{query.q}&rdquo;.</p>
            <Link href="/admin" className={buttonVariants({ variant: "outline", size: "sm" })}>
              Clear search
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-plate">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                <tr>
                  <SortHeader query={query} sort="name" align="left" className="px-4">
                    User
                  </SortHeader>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Role
                  </th>
                  <SortHeader query={query} sort="problems">
                    Problems
                  </SortHeader>
                  <SortHeader query={query} sort="attempts">
                    Attempts
                  </SortHeader>
                  <SortHeader query={query} sort="solutions">
                    Solutions
                  </SortHeader>
                  <SortHeader query={query} sort="active">
                    Last active
                  </SortHeader>
                  <SortHeader query={query} sort="joined">
                    Joined
                  </SortHeader>
                  <th scope="col" className="w-32 py-2 pr-4">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((u) => {
                  const isSelf = u.id === String(admin._id);
                  return (
                    <tr key={u.id} className="transition-colors hover:bg-muted/40">
                      <td className="max-w-72 px-4 py-3">
                        <div className="flex flex-col">
                          <span className="truncate font-medium">
                            {u.name ?? <span className="text-muted-foreground">No name</span>}
                            {isSelf && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(you)</span>}
                          </span>
                          <span className="truncate text-xs text-muted-foreground">{u.email}</span>
                          {(!u.verified || !u.onboarded) && (
                            <span className="mt-1 flex gap-1">
                              {!u.verified && <Badge variant="outline">Unverified</Badge>}
                              {u.verified && !u.onboarded && <Badge variant="outline">Setting up</Badge>}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                          {u.role === "admin" ? "Admin" : "User"}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{number.format(u.problems)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{number.format(u.attempts)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{number.format(u.solutions)}</td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-muted-foreground">
                        {u.lastActiveAt ? timeAgo(u.lastActiveAt, now) : "Never"}
                      </td>
                      <td className="px-3 py-3 text-right whitespace-nowrap text-muted-foreground">
                        {dateFormat.format(new Date(u.joinedAt))}
                      </td>
                      <td className="py-3 pr-4 text-right">
                        {!isSelf && <RoleButton id={u.id} label={u.name ?? u.email} role={u.role} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pageCount > 1 && (
          <nav aria-label="Pages" className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Page {page} of {pageCount}
            </span>
            <div className="flex gap-2">
              {page > 1 ? (
                <Link href={hrefWith(query, { page: page - 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  <ChevronLeftIcon /> Previous
                </Link>
              ) : null}
              {page < pageCount ? (
                <Link href={hrefWith(query, { page: page + 1 })} className={buttonVariants({ variant: "outline", size: "sm" })}>
                  Next <ChevronRightIcon />
                </Link>
              ) : null}
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}
