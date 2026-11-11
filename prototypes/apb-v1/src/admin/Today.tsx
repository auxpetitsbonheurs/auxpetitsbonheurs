import { Link } from 'react-router-dom'
import { addDays } from '../domain/time'
import { nextStatus } from '../domain/status'
import { moveOrder } from '../mocks/orderActions'
import { todayMU, useDb, useNow } from '../mocks/store'
import { btn } from '../ui/ui'
import { nextLabel, OrderRow, useActor, windowIndex } from './common'
import type { Order } from '../domain/types'
import { fmtDate } from '../domain/time'

const SHOWN = ['pending', 'approved', 'preparing', 'ready', 'out', 'completed']

export function Today() {
  const db = useDb()
  useNow()
  const actor = useActor()
  const today = todayMU()
  const tomorrow = addDays(today, 1)
  const toReview = db.orders.filter((o) => o.status === 'pending' || o.status === 'quote_needed').length
  const quotes = db.orders.filter((o) => o.status === 'quote_needed').length
  const unpaid = db.orders.filter((o) => ['approved', 'preparing', 'ready', 'out', 'completed'].includes(o.status) && !o.paid).length
  const day = (d: string): Order[] =>
    db.orders.filter((o) => o.date === d && SHOWN.includes(o.status)).sort((a, b) => windowIndex(db.settings, a.window) - windowIndex(db.settings, b.window))

  const counts: [string, number, string][] = [['To review', toReview, '/admin/orders'], ['Quotes to send', quotes, '/admin/orders'], ['Unpaid', unpaid, '/admin/orders']]

  const section = (title: string, d: string) => (
    <section className="space-y-2" aria-label={title}>
      <h2 className="text-xl">{title} <span className="text-sm font-normal text-ink-soft">{fmtDate(d, 'en')}</span></h2>
      {day(d).length === 0 && <p className="text-sm text-ink-soft">Nothing scheduled.</p>}
      {day(d).map((o) => {
        const label = nextLabel(o)
        const to = nextStatus(o)
        return (
          <OrderRow key={o.id} o={o} settings={db.settings} action={
            label && to ? <button type="button" className={btn('primary', 'w-full')} onClick={() => moveOrder(o.id, to, actor)}>{label}</button> : undefined
          } />
        )
      })}
    </section>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-3xl">Today</h1>
      <div className="grid grid-cols-3 gap-2">
        {counts.map(([label, n, to]) => (
          <Link key={label} to={to} className="rounded-card border border-honey-200 bg-paper p-3 text-center">
            <p className="font-serif text-3xl font-semibold text-honey-700">{n}</p>
            <p className="text-xs font-semibold text-ink-soft">{label}</p>
          </Link>
        ))}
      </div>
      {section('Today', today)}
      {section('Tomorrow', tomorrow)}
    </div>
  )
}
