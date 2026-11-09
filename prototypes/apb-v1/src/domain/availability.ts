import type { BlockedDate } from './types'
import { addDays, weekday } from './time'

export interface AvailCtx {
  today: string
  noticeDays: number
  closedDays: number[]
  blocked: BlockedDate[]
}
export type DateProblem = 'blocked' | 'closed' | 'notice'

/** N = largest notice among items that set one, else the default. */
export function noticeFor(items: { noticeDays?: number }[], defaultNotice: number): number {
  const set = items.map((i) => i.noticeDays).filter((n): n is number => typeof n === 'number')
  return set.length ? Math.max(...set) : defaultNotice
}

export function dateProblem(ymd: string, ctx: AvailCtx): DateProblem | null {
  if (ctx.blocked.some((b) => ymd >= b.from && ymd <= b.to)) return 'blocked'
  if (ctx.closedDays.includes(weekday(ymd))) return 'closed'
  if (ymd < addDays(ctx.today, ctx.noticeDays)) return 'notice'
  return null
}

export function earliestDate(ctx: AvailCtx): string {
  let d = addDays(ctx.today, ctx.noticeDays)
  for (let i = 0; i < 400 && dateProblem(d, ctx); i++) d = addDays(d, 1)
  return d
}

/** Unblock one day: shrink or split the block that covers it. */
export function removeDayFromBlocks(blocks: BlockedDate[], ymd: string): BlockedDate[] {
  const out: BlockedDate[] = []
  for (const b of blocks) {
    if (ymd < b.from || ymd > b.to) {
      out.push(b)
      continue
    }
    if (b.from < ymd) out.push({ ...b, id: `${b.id}a`, to: addDays(ymd, -1) })
    if (b.to > ymd) out.push({ ...b, id: `${b.id}b`, from: addDays(ymd, 1) })
  }
  return out
}
