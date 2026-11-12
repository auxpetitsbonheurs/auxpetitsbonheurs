import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dateProblem, noticeFor } from '../domain/availability'
import { formatRs } from '../domain/money'
import { defaultSelection, priceLine, selectionProblems } from '../domain/pricing'
import type { Fulfilment, OrderItem, Product, Selection } from '../domain/types'
import { findCustomer, placeManualOrder } from '../mocks/orderActions'
import { todayMU, useDb, useNow } from '../mocks/store'
import { OptionPicker } from '../ui/OptionPicker'
import { tEn } from '../i18n'
import { btn, Field, inputCls, qtyLabels, Sheet, Stepper } from '../ui/ui'
import { quantityBounds } from '../domain/pricing'
import { useActor } from './common'

type Line = Omit<OrderItem, 'id'>

export function ManualOrder() {
  const db = useDb()
  const now = useNow()
  const nav = useNavigate()
  const actor = useActor()
  const [lines, setLines] = useState<Line[]>([])
  const [pick, setPick] = useState<Product | null>(null)
  const [sel, setSel] = useState<Selection | null>(null)
  const [free, setFree] = useState({ name: '', price: '', qty: '1' })
  const [c, setC] = useState({ name: '', phone: '', email: '' })
  const [f, setF] = useState({ date: todayMU(), window: db.settings.windows[0].id, fulfilment: 'pickup' as Fulfilment, address: '', landmark: '', fee: String(db.settings.deliveryFee), paid: false, note: '' })
  const [err, setErr] = useState('')

  const found = findCustomer(db, c.phone, c.email)
  const delivery = f.fulfilment === 'delivery'
  const total = lines.reduce((t, l) => t + l.lineTotal, 0) + (delivery ? Number(f.fee) || 0 : 0)
  const prods = db.products.filter((p) => p.status !== 'hidden')
  const notice = noticeFor(lines.map((l) => db.products.find((p) => p.id === l.productId) ?? {}), db.settings.defaultNotice)
  const problem = dateProblem(f.date, { today: todayMU(), noticeDays: notice, closedDays: db.settings.closedDays, blocked: db.blocked })

  const addProduct = () => {
    if (!pick || !sel || selectionProblems(pick, sel).length) return
    setLines([...lines, priceLine(pick, sel, db.promotions, now)])
    setPick(null); setSel(null)
  }
  const addFree = () => {
    const price = Number(free.price), qty = Number(free.qty) || 1
    if (!free.name.trim() || !price) return
    setLines([...lines, { name: { en: free.name.trim(), fr: free.name.trim() }, options: [], qty, basePrice: price, originalBase: price, unit: price, lineTotal: price * qty }])
    setFree({ name: '', price: '', qty: '1' })
  }
  const save = () => {
    const r = placeManualOrder({
      items: lines, customer: { name: c.name.trim(), phone: c.phone.trim(), email: c.email.trim() }, fulfilment: f.fulfilment,
      address: f.address, landmark: f.landmark, date: f.date, window: f.window, deliveryFee: Number(f.fee) || 0, paid: f.paid, adminNote: f.note,
    }, actor)
    if (r.ok) nav(`/admin/orders/${r.order.id}`)
    else setErr('Add at least one item, and a customer name and phone.')
  }

  return (
    <div className="space-y-4 pb-6">
      <Link to="/admin/orders" className="inline-flex min-h-11 items-center text-sm font-semibold text-wine-700">&lsaquo; Orders</Link>
      <h1 className="text-3xl">Add order</h1>
      <section className="space-y-2">
        <h2 className="text-lg">Items</h2>
        {lines.map((l, i) => (
          <div key={i} className="flex items-center justify-between rounded-xl border border-wine-200 bg-paper p-2 text-sm">
            <span>{l.qty} x {l.name.en} {l.options.length ? `(${l.options.map((o) => o.choice.en).join(', ')})` : ''}</span>
            <span>{formatRs(l.lineTotal)} <button className="ml-2 min-h-11 text-red-700" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button></span>
          </div>
        ))}
        <select className={inputCls} aria-label="Add a product" value="" onChange={(e) => { const p = prods.find((x) => x.id === e.target.value) ?? null; setPick(p); setSel(p ? defaultSelection(p) : null) }}>
          <option value="">+ Add a menu product...</option>
          {prods.map((p) => <option key={p.id} value={p.id}>{p.name.en}</option>)}
        </select>
        <div className="grid grid-cols-[1fr_5rem_4rem] gap-2">
          <input className={inputCls} placeholder="Free-text item" aria-label="Free item name" value={free.name} onChange={(e) => setFree({ ...free, name: e.target.value })} />
          <input className={inputCls} placeholder="Rs" inputMode="numeric" aria-label="Free item price" value={free.price} onChange={(e) => setFree({ ...free, price: e.target.value.replace(/\D/g, '') })} />
          <input className={inputCls} placeholder="Qty" inputMode="numeric" aria-label="Free item quantity" value={free.qty} onChange={(e) => setFree({ ...free, qty: e.target.value.replace(/\D/g, '') })} />
        </div>
        <button className={btn('outline')} onClick={addFree}>Add free-text item</button>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Customer</h2>
        <Field label="Phone"><input className={inputCls} type="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} /></Field>
        <Field label="Email (optional)"><input className={inputCls} type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} /></Field>
        {found && <button className={btn('outline')} onClick={() => setC({ name: found.name, phone: found.phone, email: found.email })}>Use existing customer: {found.name}</button>}
        <Field label="Name"><input className={inputCls} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg">Delivery</h2>
        <Field label="Date"><input className={inputCls} type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        {problem && <p className="rounded-xl bg-amber-100 p-2 text-sm">Warning: this date is {problem === 'notice' ? 'too soon' : problem}. You can still save it.</p>}
        <Field label="Window"><select className={inputCls} value={f.window} onChange={(e) => setF({ ...f, window: e.target.value })}>{db.settings.windows.map((w) => <option key={w.id} value={w.id}>{w.name.en}</option>)}</select></Field>
        <Field label="Delivery or pickup"><select className={inputCls} value={f.fulfilment} onChange={(e) => setF({ ...f, fulfilment: e.target.value as Fulfilment })}><option value="pickup">Pickup</option><option value="delivery">Delivery</option></select></Field>
        {delivery && <>
          <Field label="Address"><input className={inputCls} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <Field label="Landmark"><input className={inputCls} value={f.landmark} onChange={(e) => setF({ ...f, landmark: e.target.value })} /></Field>
          <Field label="Delivery fee (Rs)"><input className={inputCls} inputMode="numeric" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value.replace(/\D/g, '') })} /></Field>
        </>}
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-wine-600" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />Already paid</label>
        <Field label="Private note"><input className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </section>
      {err && <p role="alert" className="text-sm font-semibold text-red-700">{err}</p>}
      <button className={btn('primary', 'w-full')} onClick={save}>Save as Approved &middot; {formatRs(total)}</button>

      {pick && sel && (
        <Sheet title={pick.name.en} onClose={() => setPick(null)}>
          <OptionPicker product={pick} sel={sel} onChange={setSel} lang="en" />
          <div className="my-3"><Stepper {...qtyLabels(tEn, pick.name.en)} value={sel.qty} min={quantityBounds(pick).min} max={quantityBounds(pick).max} onChange={(qty) => setSel({ ...sel, qty })} /></div>
          <button className={btn('primary', 'w-full')} disabled={selectionProblems(pick, sel).length > 0} onClick={addProduct}>Add &middot; {formatRs(priceLine(pick, sel, db.promotions, now).lineTotal)}</button>
        </Sheet>
      )}
    </div>
  )
}
