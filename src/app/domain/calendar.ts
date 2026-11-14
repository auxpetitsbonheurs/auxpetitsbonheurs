// Admin calendar geometry (admin-calendar-prep spec, FR-058): month grids that start on Monday
// (owner decision 15), week ranges, the `?month&view&date` query and each day's block flags.
// Pure, Mauritius calendar dates ("YYYY-MM-DD") only; "today" comes from the caller.
import { addDays, isoWeekday, isValidMuDate } from "./time";

export type CalendarView = "month" | "week" | "day";

export interface GridDay {
  date: string;
  inMonth: boolean;
}

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** "2026-11" moved by `delta` months. */
export function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (mon - 1) + delta;
  return `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** The Monday of `date`'s week. */
export const mondayOf = (date: string) => addDays(date, 1 - isoWeekday(date));

/** Monday to Sunday of `date`'s week. */
export function weekOf(date: string): string[] {
  const monday = mondayOf(date);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** The weeks (4 to 6) that show `month`, each Monday to Sunday. */
export function monthGrid(month: string): GridDay[][] {
  const first = `${month}-01`;
  const next = `${shiftMonth(month, 1)}-01`;
  const weeks: GridDay[][] = [];
  for (let monday = mondayOf(first); monday < next; monday = addDays(monday, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return { date, inMonth: date.startsWith(month) };
    }));
  }
  return weeks;
}

export type CalendarQuery =
  | { ok: true; view: CalendarView; month: string; date: string; from: string; to: string }
  | { ok: false };

/**
 * `?month=YYYY-MM&view=month|week|day&date=YYYY-MM-DD` (contracts.md `admin/calendar`). No view
 * = month; the month defaults to the date's, the date to today. Anything malformed is refused
 * (the loader answers 400). `from`/`to` are the dates the view shows, both included.
 */
export function parseCalendarQuery(search: URLSearchParams, today: string): CalendarQuery {
  const view = search.get("view") ?? "month";
  if (view !== "month" && view !== "week" && view !== "day") return { ok: false };
  const rawDate = search.get("date");
  if (rawDate !== null && !isValidMuDate(rawDate)) return { ok: false };
  if (view !== "month" && rawDate === null) return { ok: false };
  const rawMonth = search.get("month");
  if (rawMonth !== null && !MONTH_PATTERN.test(rawMonth)) return { ok: false };
  const date = rawDate ?? (rawMonth ? `${rawMonth}-01` : today);
  const month = view === "month" && rawMonth ? rawMonth : date.slice(0, 7);
  const showDate = view === "month" && rawMonth && !rawDate ? (today.startsWith(rawMonth) ? today : `${rawMonth}-01`) : date;
  if (view === "day") return { ok: true, view, month, date, from: date, to: date };
  if (view === "week") {
    const week = weekOf(date);
    return { ok: true, view, month, date, from: week[0]!, to: week[6]! };
  }
  const grid = monthGrid(month);
  return { ok: true, view, month, date: showDate, from: grid[0]![0]!.date, to: grid.at(-1)![6]!.date };
}

export interface CalendarBlock {
  startsOn: string;
  endsOn: string;
  reason: string | null;
}

export interface CalendarDayFlags {
  blocked: boolean;
  /** `range` when any Owner range covers the day (an Admin cannot reopen it, S-138 AC5). */
  blockKind: "single" | "range" | null;
  /** Private: admins only, never in a customer response (FR-014). */
  blockReason: string | null;
  /** A closed weekday (Availability): not a block, no Block/Reopen action (S-136 AC4, S-138 AC10). */
  closedDay: boolean;
}

export function calendarDayFlags(date: string, blocks: readonly CalendarBlock[], closedWeekdays: readonly number[]): CalendarDayFlags {
  const covering = blocks.filter((block) => date >= block.startsOn && date <= block.endsOn);
  const range = covering.some((block) => block.startsOn !== block.endsOn);
  return {
    blocked: covering.length > 0,
    blockKind: covering.length === 0 ? null : range ? "range" : "single",
    blockReason: covering.find((block) => block.reason)?.reason ?? null,
    closedDay: closedWeekdays.includes(isoWeekday(date)),
  };
}
