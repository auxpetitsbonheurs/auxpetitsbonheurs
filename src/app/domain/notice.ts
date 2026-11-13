// The earliest date one product can be ready (FR-007, FR-013, S-065 AC3): today plus its notice,
// moved past closed weekdays and blocked days. Display only, for this product alone: the
// basket and checkout decide the order's real earliest date. Pure; Mauritius calendar dates.

export interface OpenDays {
  /** ISO weekdays 1 (Mon) .. 7 (Sun). */
  closedWeekdays: readonly number[];
  /** Inclusive `YYYY-MM-DD` ranges. */
  blocked: readonly { startsOn: string; endsOn: string }[];
}

/** How far past the notice an open day is searched before giving up (DAY_HORIZON, contracts). */
const HORIZON_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const toUtc = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromUtc = (ms: number) => new Date(ms).toISOString().slice(0, 10);
/** ISO weekday of a calendar date, computed in UTC (no server time zone involved). */
const isoWeekday = (ms: number) => ((new Date(ms).getUTCDay() + 6) % 7) + 1;

export function isOpenDay(date: string, open: OpenDays): boolean {
  if (open.closedWeekdays.includes(isoWeekday(toUtc(date)))) return false;
  return !open.blocked.some((range) => date >= range.startsOn && date <= range.endsOn);
}

/** The first open day on or after `today + noticeDays`, or null when none within the horizon. */
export function earliestProductDate({ today, noticeDays, ...open }: OpenDays & { today: string; noticeDays: number }): string | null {
  const start = toUtc(today) + Math.max(0, noticeDays) * DAY_MS;
  for (let i = 0; i <= HORIZON_DAYS; i++) {
    const date = fromUtc(start + i * DAY_MS);
    if (isOpenDay(date, open)) return date;
  }
  return null;
}
