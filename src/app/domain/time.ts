// The only place converting instants <-> Mauritius calendar dates (architecture:
// i18n & locale, NFR-008). Indian/Mauritius is fixed UTC+4 with no DST, so the
// conversion is a constant offset; formatting uses Intl with the zone named.
// Never use getDate/getHours/getDay here (ESLint forbids them in app/domain).
import type { Locale } from "~/lib/locale";
import { DomainError } from "./errors";

export const MU_TIME_ZONE = "Indian/Mauritius";
const MU_OFFSET_MS = 4 * 60 * 60 * 1000;

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** The Mauritius calendar date (YYYY-MM-DD) at instant `now`. */
export function todayMU(now: Date): string {
  return new Date(now.getTime() + MU_OFFSET_MS).toISOString().slice(0, 10);
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function validDate(year: number, month: number, day: number): boolean {
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** "2026-11-12T18:00" (Mauritius wall time) -> the UTC instant. Throws on impossible values. */
export function muDateTimeToInstant(value: string): Date {
  const match = DATE_TIME.exec(value);
  const [year, month, day, hour, minute] = (match?.slice(1) ?? []).map(Number);
  if (
    !match ||
    !validDate(year!, month!, day!) ||
    hour! > 23 ||
    minute! > 59
  ) {
    throw new DomainError("INVALID_DATE_TIME", `Not a valid Mauritius date and time: "${value}"`);
  }
  return new Date(Date.UTC(year!, month! - 1, day!, hour!, minute!) - MU_OFFSET_MS);
}

function parseDate(value: string): Date {
  const match = DATE.exec(value);
  const [year, month, day] = (match?.slice(1) ?? []).map(Number);
  if (!match || !validDate(year!, month!, day!)) {
    throw new DomainError("INVALID_DATE", `Not a valid date: "${value}"`);
  }
  return new Date(Date.UTC(year!, month! - 1, day!));
}

const INTL_LOCALE: Record<Locale, string> = { en: "en-GB", fr: "fr-FR" };

const LOG_DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: MU_TIME_ZONE });
const LOG_TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: MU_TIME_ZONE,
});

/** Admin activity log stamp, "12 Nov 14:05" in Mauritius time; same in both languages (S-006 AC9). */
export function formatLogTime(instant: Date, _locale: Locale): string {
  return `${LOG_DAY.format(instant)} ${LOG_TIME.format(instant)}`;
}

/** "14:05" in Mauritius time, 24 h in both languages ("Updated by Sarah at 14:05"). */
export function formatClockTime(instant: Date): string {
  return LOG_TIME.format(instant);
}

const DAY_LABEL: Record<Locale, Intl.DateTimeFormat> = {
  en: new Intl.DateTimeFormat(INTL_LOCALE.en, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
  fr: new Intl.DateTimeFormat(INTL_LOCALE.fr, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
};

/** A calendar date as "Thu 12 Nov" (EN) or "jeu. 12 nov." (FR). */
export function formatDayLabel(date: string, locale: Locale): string {
  return DAY_LABEL[locale].format(parseDate(date));
}

/** A calendar date as "Sunday 14 February 2027" (EN) or "dimanche 14 février 2027" (FR). */
export function formatLongDate(date: string, locale: Locale): string {
  // Built on call (server pages only), so client bundles importing this module carry no new formatter.
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(parseDate(date));
}
