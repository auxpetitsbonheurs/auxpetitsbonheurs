// Owner availability rules (S-056, S-057, FR-066). Pure: shared by the Availability form and
// the saves (contracts.md `AvailabilityInput`, `addBlock`), and (S-083, S-084) the customer
// date rules shared by the checkout date picker and placeOrder's server re-check.
import { DomainError } from "./errors";
import { type SeasonWindow, isInSeason } from "./season";
import { TIME_PATTERN } from "./settings";
import { addDays, isValidMuDate, isoWeekday } from "./time";

export const NOTICE_DAYS_LIMIT = 60;
export const WINDOWS_MIN = 1;
export const WINDOWS_MAX = 6;
export const WINDOW_LABEL_MAX = 40;
export const BLOCK_REASON_MAX = 200;
/** ISO weekdays, Monday first (1) to Sunday (7). */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
/** Window ids: kept as they are (orders snapshot them); new rows get a short random one. */
export const WINDOW_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type WindowList = "deliveryWindows" | "pickupWindows";

export interface WindowValue {
  id: string;
  start: string;
  end: string;
  label: { en: string; fr?: string };
}

/** Minutes after midnight of an "HH:mm" time; NaN when it is not one. */
export function minutesOf(time: string): number {
  if (!TIME_PATTERN.test(time)) return Number.NaN;
  const [h, m] = time.split(":").map(Number) as [number, number];
  return h * 60 + m;
}

/** Positions of windows that overlap another in the same list (touching ends do not overlap). */
export function overlappingWindows(windows: readonly Pick<WindowValue, "start" | "end">[]): number[] {
  const overlapping = new Set<number>();
  windows.forEach((a, i) => {
    windows.forEach((b, j) => {
      if (j <= i) return;
      if (minutesOf(a.start) < minutesOf(b.end) && minutesOf(b.start) < minutesOf(a.end)) {
        overlapping.add(i);
        overlapping.add(j);
      }
    });
  });
  return [...overlapping].sort((x, y) => x - y);
}

/** A real calendar date "YYYY-MM-DD" (rejects 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// ---------------------------------------------------------------------------
// Customer dates (S-083, S-084; pricing spec "availability.ts"). One module for the date
// picker (browser) and placeOrder (server re-check), so a date offered is a date accepted.

/** Days a customer may choose from, today included (contracts `DayStatus[90]`). */
export const DAY_HORIZON = 90;

/** Why a day cannot be chosen; priority blocked > closed > too_soon > too_far > out_of_season. */
export type DayReason = "blocked" | "closed" | "too_soon" | "too_far" | "out_of_season";

/** contracts.md `DayStatus`: never a private block reason (FR-014). */
export interface DayStatus {
  date: string;
  available: boolean;
  reason: DayReason | null;
}

/** Mauritius dates, both ends included. */
export interface DateRange {
  startsOn: string;
  endsOn: string;
}

/** The public Owner rules (Settings + blocked ranges without their private reasons). */
export interface AvailabilityRules {
  defaultNoticeDays: number;
  /** ISO weekdays, Monday 1 to Sunday 7. */
  closedWeekdays: readonly number[];
  blocked: readonly DateRange[];
}

export interface AvailabilityCtx extends AvailabilityRules {
  /** `todayMU(now)`: never the server's own zone. */
  today: string;
  horizonDays?: number;
}

/** Largest notice of the items; an item without its own counts as the default (owner Q21). */
export function noticeDaysFor(items: readonly { noticeDays: number | null | undefined }[], defaultDays: number): number {
  return items.reduce((largest, item) => Math.max(largest, item.noticeDays ?? defaultDays), items.length === 0 ? defaultDays : 0);
}

const inRange = (date: string, range: DateRange) => date >= range.startsOn && date <= range.endsOn;

function reasonFor(date: string, ctx: AvailabilityCtx, noticeDays: number, seasons: readonly DateRange[]): DayReason | null {
  // A past day is simply gone, whatever else it was.
  if (date < ctx.today) return "too_soon";
  if (ctx.blocked.some((range) => inRange(date, range))) return "blocked";
  if (ctx.closedWeekdays.includes(isoWeekday(date))) return "closed";
  if (date < addDays(ctx.today, noticeDays)) return "too_soon";
  if (date >= addDays(ctx.today, ctx.horizonDays ?? DAY_HORIZON)) return "too_far";
  if (!seasons.every((range) => inRange(date, range))) return "out_of_season";
  return null;
}

/**
 * One day for a basket: `noticeDays` from `noticeDaysFor`, `seasons` the seasonal windows of
 * its items (the date must lie inside every one, owner Q2). Throws INVALID_DATE on a bad date.
 */
export function dayStatus(date: string, ctx: AvailabilityCtx, noticeDays: number, seasons: readonly DateRange[] = []): DayStatus {
  if (!isValidMuDate(date)) throw new DomainError("INVALID_DATE", `Not a valid date: "${date}"`);
  const reason = reasonFor(date, ctx, noticeDays, seasons);
  return { date, available: reason === null, reason };
}

/** `count` days from today (the picker's 90). */
export function dayStatuses(ctx: AvailabilityCtx, noticeDays: number, seasons: readonly DateRange[] = [], count = ctx.horizonDays ?? DAY_HORIZON): DayStatus[] {
  return Array.from({ length: count }, (_, i) => dayStatus(addDays(ctx.today, i), ctx, noticeDays, seasons));
}

/** The first available day inside the horizon, or null (then: "No dates available"). */
export function earliestDate(ctx: AvailabilityCtx, noticeDays: number, seasons: readonly DateRange[] = []): string | null {
  return dayStatuses(ctx, noticeDays, seasons).find((day) => day.available)?.date ?? null;
}

/** Server re-check (FR-015): throws DATE_UNAVAILABLE `{ reason }` or INVALID_DATE. */
export function assertOrderable(date: string, ctx: AvailabilityCtx, noticeDays: number, seasons: readonly DateRange[] = []): void {
  const { reason } = dayStatus(date, ctx, noticeDays, seasons);
  if (reason !== null) throw new DomainError("DATE_UNAVAILABLE", `Date ${date} is not available: ${reason}`, { reason });
}

export type AdminDateWarning = "blocked" | "closed" | "too_soon";

/** Manual orders and edits (FR-056): every rule the date breaks, as warnings; never throws. */
export function adminDateWarnings(date: string, ctx: AvailabilityCtx, noticeDays: number): AdminDateWarning[] {
  if (!isValidMuDate(date)) return [];
  const warnings: AdminDateWarning[] = [];
  if (ctx.blocked.some((range) => inRange(date, range))) warnings.push("blocked");
  if (ctx.closedWeekdays.includes(isoWeekday(date))) warnings.push("closed");
  if (date < addDays(ctx.today, noticeDays)) warnings.push("too_soon");
  return warnings;
}

export type AvailabilityProblem = "hidden" | "out_of_season" | "sold_out";

/** Display by today's Mauritius date (S-084 AC1..3): hidden > out_of_season > sold_out. */
export function productProblem(product: { status: "available" | "sold_out" | "hidden"; season: SeasonWindow | null | undefined }, today: string): AvailabilityProblem | null {
  if (product.status === "hidden") return "hidden";
  if (!isInSeason(product.season ?? null, today)) return "out_of_season";
  return product.status === "sold_out" ? "sold_out" : null;
}

/** The first seasonal item whose window leaves `date` out (the picker names it), or null. */
export function seasonBlocking<T extends DateRange>(date: string, items: readonly T[]): T | null {
  return items.find((item) => !inRange(date, item)) ?? null;
}

/** What the date rules need from one orderable basket product (`name` only names a season). */
export interface DatedItem<N = unknown> {
  name: N;
  noticeDays: number | null | undefined;
  season: SeasonWindow | null | undefined;
}

export interface BasketDates<N = unknown> {
  days: DayStatus[];
  earliest: string | null;
  noticeDays: number;
  /** One per seasonal item, with its name for "{item} is only available {start} to {end}". */
  seasons: (DateRange & { name: N })[];
}

/** The checkout's 90 days for these orderable items: what the picker shows and placeOrder re-checks. */
export function basketDates<N>(today: string, rules: AvailabilityRules, items: readonly DatedItem<N>[]): BasketDates<N> {
  const ctx: AvailabilityCtx = { today, ...rules };
  const noticeDays = noticeDaysFor(items, rules.defaultNoticeDays);
  const seasons = items.flatMap((item) => (item.season ? [{ startsOn: item.season.startsOn, endsOn: item.season.endsOn, name: item.name }] : []));
  const days = dayStatuses(ctx, noticeDays, seasons);
  return { days, earliest: days.find((day) => day.available)?.date ?? null, noticeDays, seasons };
}

/** A short id for a window added in the form ("w-3f9a1c"). */
export function newWindowId(random: () => number = Math.random): string {
  return `w-${Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}
