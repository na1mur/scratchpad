"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "cn";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ACTIVITY_COLUMNS,
  activityLevel,
  activityView,
  addDays,
  weekdayIndex,
  type ActivityData,
  type ActivitySelection,
  type ActivityView,
} from "@/lib/activity";
import { api } from "@/lib/fetcher";

/** Empty squares read as unmarked graph paper; the rest step up through the brand mint. */
const SHADE = ["bg-foreground/[0.07]", "bg-brand/30", "bg-brand/55", "bg-brand/80", "bg-brand"] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** `2026-10-14` as text, read as a calendar date so no time zone can shift it. */
function formatDay(day: string, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat("en", { ...options, timeZone: "UTC" }).format(new Date(`${day}T00:00:00Z`));
}

/** Month names above the column that holds each month's first week, kept three columns apart. */
function monthLabels(start: string, weeks: number) {
  const labels: { col: number; text: string }[] = [];
  let previous = "";
  for (let col = 0; col < weeks; col++) {
    const monday = addDays(start, col * 7);
    const month = monday.slice(0, 7);
    if (month === previous) continue;
    previous = month;
    const last = labels.at(-1);
    // The first column often holds the tail of a month; give way to the next label if it's too close.
    if (last && col - last.col < 3) {
      if (labels.length === 1) labels.pop();
      else continue;
    }
    if (col > weeks - 3) continue;
    labels.push({ col, text: formatDay(monday, { month: "short" }) });
  }
  return labels;
}

/** "the past year" or "2025". */
function periodName(activity: ActivityData, view: ActivityView) {
  const year = Number(view.from.slice(0, 4));
  return view.from === `${year}-01-01` ? String(year) : "the past year";
}

function YearPicker({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: ActivitySelection;
  onChange: (value: ActivitySelection) => void;
}) {
  return (
    <div role="group" aria-label="Period" className="flex flex-wrap gap-1 xl:w-24 xl:shrink-0 xl:flex-col">
      {(["past", ...years] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-md px-3 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
            option === value
              ? "bg-brand font-medium text-brand-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
          )}
        >
          {option === "past" ? "Past year" : option}
        </button>
      ))}
    </div>
  );
}

function Heatmap({ activity, view }: { activity: ActivityData; view: ActivityView }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { today, counts } = activity;
  // The grid starts on a Monday; days before the first one shown (the turn of a year) are left blank.
  const start = addDays(view.from, -weekdayIndex(view.from));
  const cells: { date: string; col: number; row: number; count: number }[] = [];
  for (let col = 0; col < view.weeks; col++) {
    for (let row = 0; row < 7; row++) {
      const date = addDays(start, col * 7 + row);
      if (date < view.from) continue;
      if (date > view.to) break;
      cells.push({ date, col, row, count: counts[date] ?? 0 });
    }
  }

  const hoveredCount = hovered ? (counts[hovered] ?? 0) : 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Opens scrolled to today; phones scroll back through the year. */}
      <div
        ref={(el) => {
          if (el) el.scrollLeft = el.scrollWidth;
        }}
        className="overflow-x-auto pb-1"
      >
        <div
          role="img"
          aria-label={`Attempts per day, ${periodName(activity, view)}: ${plural(view.total, "attempt")} on ${plural(view.activeDays, "day")}.`}
          onPointerOver={(e) => {
            const date = (e.target as HTMLElement).dataset.date;
            if (date) setHovered(date);
          }}
          onPointerLeave={() => setHovered(null)}
          className="grid min-w-[640px] gap-[3px]"
          style={{
            gridTemplateColumns: `auto repeat(${ACTIVITY_COLUMNS}, minmax(0, 1fr))`,
            gridTemplateRows: "auto repeat(7, auto)",
          }}
        >
          {monthLabels(start, view.weeks).map(({ col, text }) => (
            <span
              key={col}
              aria-hidden
              className="text-xs leading-4 whitespace-nowrap text-muted-foreground"
              style={{ gridColumn: col + 2, gridRow: 1 }}
            >
              {text}
            </span>
          ))}
          {(["Mon", "Wed", "Fri"] as const).map((day, i) => (
            <span
              key={day}
              aria-hidden
              className="self-center pr-1.5 text-[10px] leading-none text-muted-foreground"
              style={{ gridColumn: 1, gridRow: i * 2 + 2 }}
            >
              {day}
            </span>
          ))}
          {cells.map(({ date, col, row, count }) => (
            <div
              key={date}
              data-date={date}
              className={cn(
                "aspect-square rounded-[2px] hover:ring-1 hover:ring-foreground/50",
                SHADE[activityLevel(count)],
              )}
              style={{ gridColumn: col + 2, gridRow: row + 2 }}
            />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <p className="min-h-4 tabular-nums" aria-hidden>
          {hovered && (
            <>
              <span className="font-medium text-foreground">
                {hoveredCount === 0 ? "No attempts" : plural(hoveredCount, "attempt")}
              </span>{" "}
              on{" "}
              {formatDay(hovered, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
              {hovered === today && " (today)"}
            </>
          )}
        </p>
        <div className="flex items-center gap-1.5" aria-hidden>
          Fewer
          {SHADE.map((shade) => (
            <span key={shade} className={cn("size-2.5 rounded-[2px]", shade)} />
          ))}
          More
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  note,
  accent,
}: {
  label: string;
  value: string;
  unit?: string;
  note: string;
  accent?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-4 first:pl-0 last:pr-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="flex items-baseline gap-1">
        <span className={cn("text-2xl font-semibold tracking-tight tabular-nums", accent && "text-brand-strong")}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </dd>
      <dd className="text-xs text-muted-foreground">{note}</dd>
    </div>
  );
}

/** Streaks count over everything the learner has done; the busiest day follows the period picked. */
function Streaks({ activity, view }: { activity: ActivityData; view: ActivityView }) {
  const { currentStreak, longestStreak, counts, today } = activity;
  const { busiest } = view;
  const doneToday = (counts[today] ?? 0) > 0;
  return (
    <dl className="grid grid-cols-3 divide-x border-t pt-4">
      <Stat
        label="Current streak"
        value={String(currentStreak)}
        unit={currentStreak === 1 ? "day" : "days"}
        note={
          currentStreak === 0 ? "Attempt today to start one" : doneToday ? "Counting today" : "Attempt today to keep it"
        }
        accent={currentStreak > 0}
      />
      <Stat
        label="Longest streak"
        value={String(longestStreak)}
        unit={longestStreak === 1 ? "day" : "days"}
        note="In a row, ever"
      />
      <Stat
        label="Busiest day"
        value={busiest ? String(busiest.count) : "0"}
        unit={busiest?.count === 1 ? "attempt" : "attempts"}
        note={
          busiest
            ? formatDay(busiest.date, {
                weekday: "short",
                day: "numeric",
                month: "short",
              })
            : "Nothing in this period"
        }
      />
    </dl>
  );
}

export function ActivityCard() {
  const [activity, setActivity] = useState<ActivityData | null>(null);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<ActivitySelection>("past");

  useEffect(() => {
    let cancelled = false;
    // The browser's zone decides where one day ends and the next begins.
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    api<{ activity: ActivityData }>(`/api/activity?tz=${encodeURIComponent(tz)}`)
      .then((r) => !cancelled && setActivity(r.activity))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const view = activity ? activityView(activity, selection) : null;
  const latest = selection === "past" || selection === activity?.years[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity</CardTitle>
        <CardDescription>
          {failed ? (
            "Couldn't load your activity. Reload the page to try again."
          ) : !activity || !view ? (
            <Skeleton className="h-4 w-56" />
          ) : view.total === 0 ? (
            latest ? (
              <>
                No attempts {selection === "past" ? "in the past year" : `in ${selection}`}.{" "}
                <Link href="/problems" className="underline underline-offset-4 hover:text-foreground">
                  Write one on a problem
                </Link>{" "}
                and today&apos;s square fills in.
              </>
            ) : (
              `No attempts in ${selection}.`
            )
          ) : (
            `${plural(view.total, "attempt")} in ${periodName(activity, view)}, on ${plural(view.activeDays, "day")}.`
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {activity && view ? (
          <>
            <div className="flex flex-col gap-4 xl:flex-row-reverse xl:items-start xl:gap-6">
              <YearPicker years={activity.years} value={selection} onChange={setSelection} />
              <div className="min-w-0 flex-1">
                <Heatmap key={selection} activity={activity} view={view} />
              </div>
            </div>
            <Streaks activity={activity} view={view} />
          </>
        ) : (
          !failed && <Skeleton className="h-28 rounded-md" aria-busy="true" />
        )}
      </CardContent>
    </Card>
  );
}
