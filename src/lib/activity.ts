/**
 * The daily-attempts calendar on the profile page (client-safe: the API builds it, the heatmap draws it).
 * Days are `YYYY-MM-DD` strings in the learner's own time zone, so all calendar math here works on those
 * strings through UTC and never depends on the machine's zone.
 */

export const ACTIVITY_WEEKS = 53;

/** Columns every grid reserves: a calendar year can span 54 weeks, and a fixed count keeps squares one size in every view. */
export const ACTIVITY_COLUMNS = 54;

/** How many calendar years the picker reaches back, counting the current one. */
export const ACTIVITY_YEARS = 4;

export type ActivityData = {
  /** The IANA zone the days were bucketed in. */
  tz: string;
  /** Today's date in that zone. */
  today: string;
  /** Years that have a calendar, newest first: the current year back to the first year with an attempt. */
  years: number[];
  /** Attempts per day, only for days that have any, from the first of the oldest year. */
  counts: Record<string, number>;
  /** Consecutive days with an attempt up to today (a quiet today doesn't break it until the day ends). */
  currentStreak: number;
  /** Longest run of consecutive days, over everything the learner has done. */
  longestStreak: number;
};

/** What the calendar shows: the rolling past year, or one calendar year. */
export type ActivitySelection = "past" | number;

export type ActivityView = {
  /** First and last day drawn. The grid starts on the Monday of `from`'s week. */
  from: string;
  to: string;
  weeks: number;
  total: number;
  activeDays: number;
  busiest: { date: string; count: number } | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const toMs = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(day: string, n: number): string {
  return fromMs(toMs(day) + n * DAY_MS);
}

/** 0 for Monday … 6 for Sunday. */
export function weekdayIndex(day: string): number {
  return (new Date(toMs(day)).getUTCDay() + 6) % 7;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toMs(to) - toMs(from)) / DAY_MS);
}

/** The first column's Monday, so the grid always ends with the week that holds today. */
export function windowStart(today: string): string {
  return addDays(today, -weekdayIndex(today) - (ACTIVITY_WEEKS - 1) * 7);
}

/** Today's date in a zone; throws on a zone name the runtime doesn't know. */
export function todayIn(tz: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Longest run, and the run that ends today (or yesterday), from the days that have an attempt. */
export function streaks(activeDays: Iterable<string>, today: string): { current: number; longest: number } {
  const days = new Set(activeDays);
  let longest = 0;
  for (const day of days) {
    if (days.has(addDays(day, -1))) continue; // not the start of a run
    let length = 1;
    while (days.has(addDays(day, length))) length++;
    longest = Math.max(longest, length);
  }
  let cursor = days.has(today) ? today : addDays(today, -1);
  let current = 0;
  while (days.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }
  return { current, longest };
}

/** Shade 0–4 for a day's attempt count. */
export function activityLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

/** Builds the response from per-day counts over the learner's whole history. */
export function buildActivity(perDay: Map<string, number>, tz: string, today: string): ActivityData {
  const thisYear = Number(today.slice(0, 4));
  const firstYear = Math.min(thisYear, ...[...perDay.keys()].map((d) => Number(d.slice(0, 4))));
  const oldest = Math.max(thisYear - (ACTIVITY_YEARS - 1), firstYear);
  const years = Array.from({ length: thisYear - oldest + 1 }, (_, i) => thisYear - i);
  const counts: Record<string, number> = {};
  for (const [date, count] of perDay) {
    if (date >= `${oldest}-01-01` && date <= today) counts[date] = count;
  }
  const { current, longest } = streaks(perDay.keys(), today);
  return { tz, today, years, counts, currentStreak: current, longestStreak: longest };
}

/** The days and totals for one selection. */
export function activityView(data: ActivityData, selection: ActivitySelection): ActivityView {
  const { today, counts } = data;
  const thisYear = Number(today.slice(0, 4));
  const rolling = selection === "past" || selection > thisYear;
  const from = rolling ? windowStart(today) : `${selection}-01-01`;
  const to = rolling || selection === thisYear ? today : `${selection}-12-31`;
  let total = 0;
  let activeDays = 0;
  let busiest: ActivityView["busiest"] = null;
  for (const [date, count] of Object.entries(counts)) {
    if (date < from || date > to) continue;
    total += count;
    activeDays++;
    if (!busiest || count > busiest.count || (count === busiest.count && date > busiest.date)) {
      busiest = { date, count };
    }
  }
  const weeks = Math.floor((daysBetween(from, to) + weekdayIndex(from)) / 7) + 1;
  return { from, to, weeks, total, activeDays, busiest };
}
