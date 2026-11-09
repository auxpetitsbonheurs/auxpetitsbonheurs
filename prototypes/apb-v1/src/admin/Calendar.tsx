import { useState } from 'react'
import { Link } from 'react-router-dom'
import { removeDayFromBlocks } from '../domain/availability'
import { prepList } from '../domain/prep'
import { countsOnCalendar } from '../domain/status'
import { addDays, addMonths, daysInMonth, fmtDate, fmtMonth, monthStart, weekday } from '../domain/time'
import { newId, todayMU, updateDb, useDb } from '../mocks/store'
import { btn } from '../ui/ui'
import { OrderRow, useActor } from './common'

export function Calendar() {
  const db = useDb()
  const actor = useActor()
  const today = todayMU()
  const [month, setMonth] = useState(monthStart(today))
  const [day, setDay] = useState<string | null>(null)
  const [prep, setPrep] = useState(false)

  const lead = (weekday(month) + 6) % 7
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth(month) }, (_, i) => addDays(month, i))]
  const ordersOn = (d: string) => db.orders.filter((o) => o.date === d && countsOnCalendar(o.status))
  const isBlocked = (d: string) => db.blocked.some((b) => d >= b.from && d <= b.to)

  const toggleBlock = (d: string) => {
    if (isBlocked(d)) updateDb((x) => ({ ...x, blocked: removeDayFromBlocks(x.blocked, d) }))
    else {
      const existing = ordersOn(d)
      if (existing.length && !window.confirm(`${existing.length} order(s) are already booked for this day (${existing.map((o) => o.number).join(', ')}). They are not affected. Block anyway?`)) return
      updateDb((x) => ({ ...x, blocked: [...x.blocked, { id: newId('blk'), from: d, to: d, reason: '', by: actor.name }] }))
    }
  }

  return (
    <div className="space-y-3">
      <h1 className="text-3xl font-semibold">Calendar</h1>
      <div className="flex items-center justify-between">
        <button className="min-h-11 min-w-11 text-2xl" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>&lsaquo;</button>
        <p className="font-serif text-lg font-semibold capitalize">{fmtMonth(month, 'en')}</p>
        <button className="min-h-11 min-w-11 text-2xl" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>&rsaquo;</button>
      </div>
      <p className="text-xs text-ink-soft"><span className="font-bold text-rose-700">Rose</span> = delivery · <span className="font-bold text-teal-700">Teal</span> = pickup · grey = blocked</p>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-ink-soft">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((n, i) => <span key={i}>{n}</span>)}</div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <span key={`e${i}`} />
          const os = ordersOn(d)
          const del = os.filter((o) => o.fulfilment === 'delivery').length
          const pk = os.length - del
          return (
            <button key={d} onClick={() => { setDay(d); setPrep(false) }} aria-label={`${fmtDate(d, 'en')}: ${os.length} orders${isBlocked(d) ? ', blocked' : ''}`}
              className={`min-h-14 rounded-xl p-1 text-sm ${isBlocked(d) ? 'bg-stone-300 text-stone-500' : 'bg-white shadow-soft'} ${d === today ? 'ring-2 ring-rose-500' : ''} ${d === day ? 'outline outline-2 outline-ink' : ''}`}>
              <span className="block font-semibold">{Number(d.slice(8))}</span>
              <span className="flex justify-center gap-1 text-xs font-bold">
                {del > 0 && <span className="text-rose-700">{del}</span>}{pk > 0 && <span className="text-teal-700">{pk}</span>}
              </span>
            </button>
          )
        })}
      </div>

      {day && (
        <section className="space-y-2 pt-2" aria-label="Selected day">
          <h2 className="text-xl font-semibold">{fmtDate(day, 'en', true)}</h2>
          <div className="flex flex-wrap gap-2">
            <button className={btn(isBlocked(day) ? 'primary' : 'outline')} onClick={() => toggleBlock(day)}>{isBlocked(day) ? 'Unblock this day' : 'Block this day'}</button>
            <button className={btn('outline')} onClick={() => setPrep(!prep)}>{prep ? 'Show orders' : 'Prep list'}</button>
            <Link to="/admin/orders/new" className={btn('ghost')}>+ Add order</Link>
          </div>
          {prep ? <Prep day={day} /> : (
            <>
              {ordersOn(day).length === 0 && <p className="text-sm text-ink-soft">No orders this day.</p>}
              {ordersOn(day).map((o) => <OrderRow key={o.id} o={o} settings={db.settings} />)}
            </>
          )}
        </section>
      )}
    </div>
  )
}

function Prep({ day }: { day: string }) {
  const db = useDb()
  const list = prepList(db.orders, day)
  return (
    <div>
      <div className="print-area rounded-2xl bg-white p-4 text-sm shadow-soft">
        <h3 className="font-serif text-lg font-semibold">Prep list - {fmtDate(day, 'en', true)}</h3>
        {list.length === 0 && <p>Nothing to prepare.</p>}
        {list.map((g) => (
          <div key={g.product} className="mt-2">
            <p className="font-bold">{g.product} (total {g.qty})</p>
            <ul className="ml-4 list-disc">
              {g.variants.map((v) => (
                <li key={v.label}>{v.qty} x {v.label}
                  {v.extras.map((m, i) => <div key={i} className="text-xs text-ink-soft">Add-ons: {m}</div>)}
                  {v.messages.map((m, i) => <div key={i} className="text-xs">Message: "{m}"</div>)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <button className={btn('outline', 'no-print mt-2')} onClick={() => window.print()}>Print / save as PDF</button>
    </div>
  )
}
