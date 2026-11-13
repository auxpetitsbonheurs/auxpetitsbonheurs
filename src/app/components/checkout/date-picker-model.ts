// The checkout date picker's pure parts (S-087): month grids, keyboard moves and the words for
// a day. The rules themselves are domain/availability.ts (shared with placeOrder).
import type { BasketDates, DayStatus } from "~/domain/availability";
import { seasonBlocking } from "~/domain/availability";
import { addDays, diffDays, formatDayMonth, formatWeekday, isoWeekday } from "~/domain/time";
import type { Locale } from "~/lib/locale";

type T = (key: string, values?: Record<string, string | number>) => string;

/** "YYYY-MM" of a date. */
export const monthOf = (date: string) => date.slice(0, 7);

/** Every month from `first` to `last`, as "YYYY-MM". */
export function monthsBetween(first: string, last: string): string[] {
  const months: string[] = [];
  for (let month = monthOf(first); month <= monthOf(last); month = monthOf(addDays(`${month}-01`, 32))) months.push(month);
  return months;
}

/** The month as weeks of seven (Monday first); `null` pads the days of other months. */
export function monthWeeks(month: string): (string | null)[][] {
  const first = `${month}-01`;
  const length = diffDays(first, `${monthOf(addDays(first, 32))}-01`);
  const cells: (string | null)[] = [...Array<null>(isoWeekday(first) - 1).fill(null), ...Array.from({ length }, (_, i) => addDays(first, i))];
  while (cells.length % 7 !== 0) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** The same day number one month away, kept inside the month (31 Jan + 1 month = 28 Feb). */
function shiftMonth(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const index = year * 12 + (month - 1) + months;
  const target = `${String(Math.floor(index / 12)).padStart(4, "0")}-${String((index % 12) + 1).padStart(2, "0")}`;
  const lastDay = diffDays(`${target}-01`, `${monthOf(addDays(`${target}-01`, 32))}-01`);
  return `${target}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

const MOVES: Record<string, (date: string) => string> = {
  ArrowLeft: (d) => addDays(d, -1),
  ArrowRight: (d) => addDays(d, 1),
  ArrowUp: (d) => addDays(d, -7),
  ArrowDown: (d) => addDays(d, 7),
  Home: (d) => addDays(d, 1 - isoWeekday(d)),
  End: (d) => addDays(d, 7 - isoWeekday(d)),
  PageUp: (d) => shiftMonth(d, -1),
  PageDown: (d) => shiftMonth(d, 1),
};

/** Where `key` moves focus from `date`, kept between `first` and `last`; null for other keys. */
export function nextFocus(date: string, key: string, first: string, last: string): string | null {
  const move = MOVES[key];
  if (!move) return null;
  const next = move(date);
  return next < first ? first : next > last ? last : next;
}

/** Why a day cannot be chosen, in the customer's words (FR-014): never a private block reason. */
export function reasonText(day: DayStatus, dates: Pick<BasketDates<string>, "noticeDays" | "seasons">, today: string, t: T, locale: Locale): string {
  switch (day.reason) {
    case null:
      return "";
    case "too_soon":
      return day.date < today ? t("checkout.dates.reasons.past") : t("checkout.dates.reasons.too_soon", { count: dates.noticeDays });
    case "closed":
      return t("checkout.dates.reasons.closed", { weekday: formatWeekday(isoWeekday(day.date), locale) });
    case "out_of_season": {
      const item = seasonBlocking(day.date, dates.seasons);
      return item ? t("checkout.dates.reasons.out_of_season", { item: item.name, start: formatDayMonth(item.startsOn, locale), end: formatDayMonth(item.endsOn, locale) }) : t("checkout.dates.reasons.blocked");
    }
    default:
      // blocked and too_far: one calm, generic label.
      return t(`checkout.dates.reasons.${day.reason}`);
  }
}
