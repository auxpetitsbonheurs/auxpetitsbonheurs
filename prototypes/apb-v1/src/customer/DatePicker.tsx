import { useState } from 'react'
import { dateProblem, type AvailCtx } from '../domain/availability'
import { addDays, addMonths, daysInMonth, fmtMonth, monthStart, weekday } from '../domain/time'
import { useI18n } from '../i18n'

interface Props { value: string; onChange: (ymd: string) => void; ctx: AvailCtx }

/** Month grid. Unavailable days are greyed but tappable: tapping explains why. */
export function DatePicker({ value, onChange, ctx }: Props) {
  const { t, lang } = useI18n()
  const [month, setMonth] = useState(monthStart(value || addDays(ctx.today, ctx.noticeDays)))
  const [why, setWhy] = useState('')

  const lead = (weekday(month) + 6) % 7 // Monday first
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i)),
  ]
  const names = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(lang === 'fr' ? 'fr-FR' : 'en-GB', { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 1 + i))))
  const canPrev = month > monthStart(ctx.today)
  const canNext = month < addMonths(monthStart(ctx.today), 6)

  const pickDay = (d: string) => {
    const problem = dateProblem(d, ctx)
    if (!problem) {
      setWhy('')
      onChange(d)
      return
    }
    setWhy(problem === 'notice' ? t('why.notice', { n: ctx.noticeDays }) : t(`why.${problem}`))
  }

  return (
    <div className="rounded-card border border-wine-200 bg-paper p-3">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" className="min-h-11 min-w-11 rounded-xl text-xl hover:bg-wine-100 disabled:opacity-30" disabled={!canPrev} onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month">&lsaquo;</button>
        <p className="font-serif font-semibold capitalize">{fmtMonth(month, lang)}</p>
        <button type="button" className="min-h-11 min-w-11 rounded-xl text-xl hover:bg-wine-100 disabled:opacity-30" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month">&rsaquo;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-soft" aria-hidden="true">
        {names.map((n, i) => <span key={i}>{n}</span>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d === null ? <span key={`e${i}`} /> : (
            <button
              key={d}
              type="button"
              onClick={() => pickDay(d)}
              aria-pressed={d === value}
              aria-disabled={!!dateProblem(d, ctx)}
              className={`min-h-11 rounded-xl text-sm font-semibold ${
                d === value ? 'bg-wine-600 text-paper'
                  : dateProblem(d, ctx) ? 'bg-stone-100 text-stone-400' : 'bg-wine-100 text-ink hover:bg-wine-200'
              }`}
            >
              {Number(d.slice(8))}
            </button>
          ))}
      </div>
      {why && <p role="status" className="mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-900">{why}</p>}
    </div>
  )
}
