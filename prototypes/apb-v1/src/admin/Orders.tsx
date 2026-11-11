import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Status } from '../domain/types'
import { useDb } from '../mocks/store'
import { btn, Chip, inputCls } from '../ui/ui'
import { OrderRow } from './common'

const TABS: { id: string; label: string; statuses: Status[] }[] = [
  { id: 'review', label: 'To review', statuses: ['pending', 'quote_needed'] },
  { id: 'upcoming', label: 'Upcoming', statuses: ['quote_sent', 'approved', 'preparing', 'ready', 'out'] },
  { id: 'done', label: 'Completed', statuses: ['completed'] },
  { id: 'closed', label: 'Cancelled / declined', statuses: ['cancelled', 'declined', 'closed'] },
]

export function Orders() {
  const db = useDb()
  const [tab, setTab] = useState('review')
  const [q, setQ] = useState('')
  const [date, setDate] = useState('')
  const [fulfil, setFulfil] = useState('')
  const [paid, setPaid] = useState('')

  const current = TABS.find((t) => t.id === tab)!
  const needle = q.trim().toLowerCase()
  const list = db.orders
    .filter((o) => current.statuses.includes(o.status))
    .filter((o) => !needle || o.number.toLowerCase().includes(needle) || o.customer.name.toLowerCase().includes(needle) || o.customer.phone.replace(/\s/g, '').includes(needle.replace(/\s/g, '')))
    .filter((o) => !date || o.date === date)
    .filter((o) => !fulfil || o.fulfilment === fulfil)
    .filter((o) => !paid || (paid === 'paid') === o.paid)
    .sort((a, b) => a.date.localeCompare(b.date))
  const count = (ids: Status[]) => db.orders.filter((o) => ids.includes(o.status)).length

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Orders</h1>
        <Link to="/admin/orders/new" className={btn('primary')}>+ Add order</Link>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4">
        {TABS.map((t) => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)}>{t.label} ({count(t.statuses)})</Chip>)}
      </div>
      <input className={inputCls} type="search" placeholder="Search name, phone or order number" aria-label="Search orders" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid grid-cols-3 gap-2">
        <input className={inputCls} type="date" aria-label="Filter by date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={inputCls} aria-label="Delivery or pickup" value={fulfil} onChange={(e) => setFulfil(e.target.value)}>
          <option value="">Any</option><option value="delivery">Delivery</option><option value="pickup">Pickup</option>
        </select>
        <select className={inputCls} aria-label="Paid" value={paid} onChange={(e) => setPaid(e.target.value)}>
          <option value="">Paid: any</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option>
        </select>
      </div>
      <div className="space-y-2">
        {list.length === 0 && <p className="py-6 text-center text-ink-soft">No orders here.</p>}
        {list.map((o) => <OrderRow key={o.id} o={o} settings={db.settings} />)}
      </div>
    </div>
  )
}
