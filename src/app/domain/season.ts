// Seasonal windows (S-049, FR-006, FR-062): a product offered only between two Mauritius
// calendar dates, both inclusive. Owner decision Q2: judged on the pickup or delivery date
// (the picker, basket and checkout call `isInSeason` in E-04/E-05). Pure.

/** Both dates as `YYYY-MM-DD` (Mauritius calendar), start <= end. */
export interface SeasonWindow {
  startsOn: string;
  endsOn: string;
}

const MU_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in `YYYY-MM-DD` (not 2026-02-30). */
export function isMuDate(value: string): boolean {
  if (!MU_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** True when `date` is inside the window, ends included; any date when there is no window. */
export function isInSeason(window: SeasonWindow | null, date: string): boolean {
  if (!window) return true;
  return date >= window.startsOn && date <= window.endsOn;
}

export type SeasonProblem = "pair" | "order" | "invalid";

/**
 * The window from the two editor fields: both blank = not seasonal; one blank = "pair";
 * a date that is not real = "invalid"; start after end = "order". One day (start = end) is fine.
 */
export function checkSeason(startsOn: string, endsOn: string): { ok: true; window: SeasonWindow | null } | { ok: false; problem: SeasonProblem } {
  const start = startsOn.trim();
  const end = endsOn.trim();
  if (start === "" && end === "") return { ok: true, window: null };
  if (start === "" || end === "") return { ok: false, problem: "pair" };
  if (!isMuDate(start) || !isMuDate(end)) return { ok: false, problem: "invalid" };
  if (start > end) return { ok: false, problem: "order" };
  return { ok: true, window: { startsOn: start, endsOn: end } };
}
