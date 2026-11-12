// Owner availability rules (S-056, S-057, FR-066). Pure: shared by the Availability form and
// the saves (contracts.md `AvailabilityInput`, `addBlock`). How the rules disable dates for
// customers is the pricing and availability domain (E-05); this file only checks them.
import { TIME_PATTERN } from "./settings";

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

/** A short id for a window added in the form ("w-3f9a1c"). */
export function newWindowId(random: () => number = Math.random): string {
  return `w-${Math.floor(random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;
}
