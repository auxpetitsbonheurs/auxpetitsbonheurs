import type { Lang } from './types'

/** Indian/Mauritius is UTC+4 all year (no DST). */
export const MU_OFFSET_MS = 4 * 3600 * 1000
export const DAY_MS = 86400000

/** Calendar date (YYYY-MM-DD) in Mauritius for an instant. */
export function ymdOf(ms: number): string {
  return new Date(ms + MU_OFFSET_MS).toISOString().slice(0, 10)
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function weekday(ymd: string): number {
  return new Date(`${ymd}T00:00:00Z`).getUTCDay()
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS)
}

/** Instant for a Mauritius local date + time. */
export function muToMs(ymd: string, hhmm = '00:00'): number {
  return Date.parse(`${ymd}T${hhmm}:00+04:00`)
}

/** Value for <input type="datetime-local"> in Mauritius time. */
export function msToLocalInput(ms: number): string {
  return new Date(ms + MU_OFFSET_MS).toISOString().slice(0, 16)
}
export function localInputToMs(v: string): number {
  return Date.parse(`${v}:00+04:00`)
}

const LOCALE: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR' }

export function fmtDate(ymd: string, lang: Lang, long = false): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  return new Intl.DateTimeFormat(LOCALE[lang], {
    timeZone: 'UTC',
    weekday: long ? 'long' : 'short',
    day: 'numeric',
    month: 'short',
  }).format(d)
}

export function fmtMonth(ymd: string, lang: Lang): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(
    new Date(`${ymd}T12:00:00Z`),
  )
}

/** "12 Nov 14:05" in Mauritius time. */
export function fmtStamp(ms: number): string {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Indian/Mauritius',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms))
  return s.replace(',', '')
}

export function monthStart(ymd: string): string {
  return `${ymd.slice(0, 7)}-01`
}
export function addMonths(ymd: string, n: number): string {
  const d = new Date(`${monthStart(ymd)}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 10)
}
export function daysInMonth(ymd: string): number {
  const d = new Date(`${monthStart(ymd)}T00:00:00Z`)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
}
