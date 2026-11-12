import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { defaultQuoteExpiry } from '../domain/quote'
import { formatRs } from '../domain/money'
import { allowedMoves, nextStatus, prevStatus } from '../domain/status'
import { fmtStamp } from '../domain/time'
import { fillTemplate, waLink } from '../domain/whatsapp'
import type { Order, TemplateKey } from '../domain/types'
import { trackingUrl } from '../mocks/emails'
import { editOrder, moveOrder, sendQuote, setAdminNote, setPaid, stepBack, type Res } from '../mocks/orderActions'
import { todayMU, useDb } from '../mocks/store'
import { Photo } from '../ui/Art'
import { btn, Field, inputCls, Sheet } from '../ui/ui'
import { itemsText, nextLabel, StatusBadge, useActor, windowLabel } from './common'
import { fmtDate } from '../domain/time'

const TEMPLATES: [TemplateKey, string][] = [['approved', 'Order approved'], ['ready', 'Ready for pickup'], ['onway', 'On the way'], ['payment', 'Payment reminder'], ['blank', 'Blank']]
type Panel = null | 'decline' | 'quote' | 'edit' | 'wa' | 'cancel'

export function OrderDetail() {
  const { id } = useParams()
  const db = useDb()
  const actor = useActor()
  const live = db.orders.find((o) => o.id === id)
  const [seen, setSeen] = useState<number | null>(null)
  const [panel, setPanel] = useState<Panel>(null)
  const [msg, setMsg] = useState('')
  if (!live) return <p className="py-8 text-center">Order not found. <Link className="underline" to="/admin/orders">Back</Link></p>
  const o: Order = live
  const version = seen ?? o.version
  const s = db.settings

  const run = (r: Res) => {
    if (r.ok) { setMsg(''); setSeen(r.order.version); setPanel(null) } else setMsg(r.error === 'conflict' ? 'This order changed (someone else acted on it). Reload to see the latest.' : `Not possible: ${r.error}`)
  }
  const admin = allowedMoves(o, 'admin')
  const next = nextStatus(o)
  const back = prevStatus(o)
  const nl = nextLabel(o)

  return (
    <div className="space-y-4 pb-6">
      <Link to="/admin/orders" className="inline-flex min-h-11 items-center text-sm font-semibold text-wine-700">&lsaquo; Orders</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">{o.number}</h1><StatusBadge status={o.status} />
      </div>
      {msg && (
        <div role="alert" className="rounded-card bg-red-100 p-3 text-sm font-semibold text-red-800">
          {msg} {msg.startsWith('This order') && <button type="button" className="ml-2 underline" onClick={() => { setSeen(null); setMsg('') }}>Reload</button>}
        </div>
      )}
      {version !== o.version && <p role="alert" className="rounded-card bg-amber-100 p-3 text-sm font-semibold">This order changed. <button type="button" className="underline" onClick={() => setSeen(null)}>Reload</button></p>}

      <div className="flex flex-wrap gap-2">
        {o.status === 'pending' && <button className={btn()} onClick={() => run(moveOrder(o.id, 'approved', actor, { expect: version }))}>Approve</button>}
        {(o.status === 'pending' || o.status === 'quote_needed') && <button className={btn('outline')} onClick={() => setPanel('decline')}>Decline</button>}
        {(o.status === 'quote_needed' || o.status === 'quote_sent') && <button className={btn()} onClick={() => setPanel('quote')}>{o.status === 'quote_sent' ? 'Re-send quote' : 'Send quote'}</button>}
        {nl && next && o.status !== 'pending' && <button className={btn()} onClick={() => run(moveOrder(o.id, next, actor, { expect: version }))}>{nl}</button>}
        {back && <button className={btn('outline')} onClick={() => run(stepBack(o.id, actor, version))}>Back one step</button>}
        <button className={btn('outline')} onClick={() => run(setPaid(o.id, !o.paid, actor, version))}>{o.paid ? 'Mark unpaid' : 'Mark paid'}</button>
        {o.status !== 'completed' && <button className={btn('outline')} onClick={() => setPanel('edit')}>Edit</button>}
        <button className={btn('outline')} onClick={() => setPanel('wa')}>WhatsApp</button>
        {admin.includes('cancelled') && <button className={btn('danger')} onClick={() => setPanel('cancel')}>Cancel order</button>}
      </div>

      <section className="rounded-card border border-wine-200 bg-paper p-4 text-sm">
        <p className="font-semibold">{o.customer.name}</p>
        <div className="flex gap-2 py-1">
          <a className={btn('outline', 'min-h-11')} href={`tel:${o.customer.phone.replace(/\s/g, '')}`}>Call</a>
          <a className={btn('outline')} href={waLink(o.customer.phone, '')} target="_blank" rel="noreferrer">WhatsApp</a>
        </div>
        <p>{o.customer.phone}{o.customer.email && ` · ${o.customer.email}`} · {o.lang.toUpperCase()}</p>
        <p className="mt-2"><strong>{o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</strong> · {fmtDate(o.date, 'en', true)} · {windowLabel(s, o.window)}</p>
        {o.fulfilment === 'delivery' && (
          <p>{o.address} ({o.landmark}) <a className="font-semibold text-wine-700" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${encodeURIComponent(o.address)}`}>Open in Maps</a></p>
        )}
        {o.customerNote && <p className="mt-1">Customer note: {o.customerNote}</p>}
        {o.declineReason && <p>Decline reason: {o.declineReason}</p>}
        <p className="mt-1 text-xs text-ink-soft">Source: {o.source} · Tracking: <a className="underline" href={trackingUrl(o)} target="_blank" rel="noreferrer">open</a></p>
      </section>

      <section className="rounded-card border border-wine-200 bg-paper p-4 text-sm">
        <h2 className="mb-1 text-lg">Items</h2>
        {o.items.length === 0 && <p>{itemsText(o)}</p>}
        {o.items.map((it) => (
          <div key={it.id} className="flex justify-between gap-2 py-1">
            <div><p className="font-semibold">{it.qty} x {it.name.en}</p>
              <p className="text-xs text-ink-soft">{[...it.options.map((x) => x.choice.en), it.message ? `"${it.message}"` : '', it.promoId ? `promo ${it.promoId}` : ''].filter(Boolean).join(' · ')}</p></div>
            <span>{formatRs(it.lineTotal)}</span>
          </div>
        ))}
        {o.deliveryFee > 0 && <div className="flex justify-between"><span>Delivery fee</span><span>{formatRs(o.deliveryFee)}</span></div>}
        <div className="mt-1 flex justify-between border-t border-wine-200 pt-1 font-semibold"><span>Total</span><span>{o.total ? formatRs(o.total) : 'No quote yet'}</span></div>
        <p>{o.paid ? 'Paid' : 'Unpaid'}</p>
        {o.quote && <p className="mt-1">Quote {formatRs(o.quote.amount)} · expires {fmtDate(o.quote.expiry, 'en')} · {o.quote.note}</p>}
      </section>

      {o.custom && (
        <section className="rounded-card border border-wine-200 bg-paper p-4 text-sm">
          <h2 className="mb-1 text-lg">Custom request</h2>
          <p>Occasion: {o.custom.occasion} · Servings: {o.custom.servings}</p>
          <p>Flavours: {o.custom.flavours}</p><p>Theme: {o.custom.theme}</p><p>Text: {o.custom.text}</p>
          {o.custom.budget && <p>Budget: {formatRs(o.custom.budget)}</p>}
          {o.custom.details && <p>Details: {o.custom.details}</p>}
          <div className="mt-2 flex flex-wrap gap-2">{o.custom.photos.map((p, i) => <Photo key={i} src={p} alt={`Reference ${i + 1}`} className="h-24 w-24 overflow-hidden rounded-xl" />)}</div>
        </section>
      )}

      <Field label="Private note (admin only)">
        <textarea className={inputCls} rows={2} defaultValue={o.adminNote} onBlur={(e) => { if (e.target.value !== o.adminNote) setAdminNote(o.id, e.target.value) }} />
      </Field>

      <section className="rounded-card border border-wine-200 bg-paper p-4 text-sm">
        <h2 className="mb-1 text-lg">Activity</h2>
        <ul className="space-y-1">
          {[...o.events].reverse().map((e, i) => (
            <li key={i}>{cap(e.what)} by {e.by.name}, {fmtStamp(e.at)}{e.details ? ` (${e.details})` : ''}</li>
          ))}
        </ul>
      </section>

      {panel === 'decline' && <DeclineSheet onClose={() => setPanel(null)} onGo={(reason) => run(moveOrder(o.id, 'declined', actor, { expect: version, reason }))} />}
      {panel === 'quote' && <QuoteSheet o={o} validity={s.quoteValidity} onClose={() => setPanel(null)} onGo={(q) => run(sendQuote(o.id, q, actor, version))} />}
      {panel === 'edit' && <EditSheet o={o} fee={s.deliveryFee} onClose={() => setPanel(null)} onGo={(p) => run(editOrder(o.id, p, actor, version))} />}
      {panel === 'wa' && <WaSheet o={o} onClose={() => setPanel(null)} />}
      {panel === 'cancel' && (
        <Sheet title="Cancel this order?" onClose={() => setPanel(null)}>
          <p className="mb-3 text-sm">The customer gets a cancellation email.</p>
          <button className={btn('danger', 'w-full')} onClick={() => run(moveOrder(o.id, 'cancelled', actor, { expect: version }))}>Yes, cancel order</button>
        </Sheet>
      )}
    </div>
  )
}
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

function DeclineSheet({ onClose, onGo }: { onClose: () => void; onGo: (r: string) => void }) {
  const [r, setR] = useState('')
  return (
    <Sheet title="Decline" onClose={onClose}>
      <Field label="Reason (optional, sent to the customer)"><textarea className={inputCls} rows={3} value={r} onChange={(e) => setR(e.target.value)} /></Field>
      <button className={btn('danger', 'mt-3 w-full')} onClick={() => onGo(r)}>Decline</button>
    </Sheet>
  )
}

function QuoteSheet({ o, validity, onClose, onGo }: { o: Order; validity: number; onClose: () => void; onGo: (q: { amount: number; note: string; expiry: string }) => void }) {
  const [amount, setAmount] = useState(String(o.quote?.amount ?? ''))
  const [note, setNote] = useState(o.quote?.note ?? '')
  const [expiry, setExpiry] = useState(defaultQuoteExpiry(todayMU(), validity))
  return (
    <Sheet title="Send quote" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Amount in Rs (full total, delivery included)"><input className={inputCls} inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} /></Field>
        <Field label="Note"><textarea className={inputCls} rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        <Field label="Expiry date"><input className={inputCls} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} /></Field>
        <button className={btn('primary', 'w-full')} disabled={!Number(amount) || !expiry} onClick={() => onGo({ amount: Number(amount), note, expiry })}>Send quote</button>
      </div>
    </Sheet>
  )
}

function EditSheet({ o, fee, onClose, onGo }: { o: Order; fee: number; onClose: () => void; onGo: (p: Parameters<typeof editOrder>[1]) => void }) {
  const { settings } = useDb()
  const [p, setP] = useState({
    date: o.date, window: o.window, fulfilment: o.fulfilment, address: o.address, landmark: o.landmark, customer: o.customer,
    deliveryFee: o.deliveryFee || fee, customerNote: o.customerNote, adminNote: o.adminNote, override: '',
  })
  const { blocked } = useDb()
  const tooSoon = p.date < todayMU()
  const isBlocked = blocked.some((b) => p.date >= b.from && p.date <= b.to)
  return (
    <Sheet title="Edit order" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Name"><input className={inputCls} value={p.customer.name} onChange={(e) => setP({ ...p, customer: { ...p.customer, name: e.target.value } })} /></Field>
        <Field label="Phone"><input className={inputCls} type="tel" value={p.customer.phone} onChange={(e) => setP({ ...p, customer: { ...p.customer, phone: e.target.value } })} /></Field>
        <Field label="Email"><input className={inputCls} type="email" value={p.customer.email} onChange={(e) => setP({ ...p, customer: { ...p.customer, email: e.target.value } })} /></Field>
        <Field label="Date"><input className={inputCls} type="date" value={p.date} onChange={(e) => setP({ ...p, date: e.target.value })} /></Field>
        {(isBlocked || tooSoon) && <p className="rounded-xl bg-amber-100 p-2 text-sm">Warning: this date is {isBlocked ? 'blocked' : 'in the past'}. Admins may still save it.</p>}
        <Field label="Window"><select className={inputCls} value={p.window} onChange={(e) => setP({ ...p, window: e.target.value })}>{settings.windows.map((w) => <option key={w.id} value={w.id}>{w.name.en}</option>)}</select></Field>
        <Field label="Delivery or pickup"><select className={inputCls} value={p.fulfilment} onChange={(e) => setP({ ...p, fulfilment: e.target.value as Order['fulfilment'] })}><option value="delivery">Delivery</option><option value="pickup">Pickup</option></select></Field>
        {p.fulfilment === 'delivery' && <>
          <Field label="Address"><input className={inputCls} value={p.address} onChange={(e) => setP({ ...p, address: e.target.value })} /></Field>
          <Field label="Landmark"><input className={inputCls} value={p.landmark} onChange={(e) => setP({ ...p, landmark: e.target.value })} /></Field>
          <Field label="Delivery fee (Rs)"><input className={inputCls} inputMode="numeric" value={p.deliveryFee} onChange={(e) => setP({ ...p, deliveryFee: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
        </>}
        <Field label="Customer note"><input className={inputCls} value={p.customerNote} onChange={(e) => setP({ ...p, customerNote: e.target.value })} /></Field>
        <Field label="Total override in Rs (blank = recalculate)"><input className={inputCls} inputMode="numeric" value={p.override} onChange={(e) => setP({ ...p, override: e.target.value.replace(/\D/g, '') })} /></Field>
        <button className={btn('primary', 'w-full')} onClick={() => onGo({
          date: p.date, window: p.window, fulfilment: p.fulfilment, address: p.address, landmark: p.landmark, customer: p.customer,
          deliveryFee: p.deliveryFee, customerNote: p.customerNote, adminNote: p.adminNote, totalOverride: p.override ? Number(p.override) : undefined,
        })}>Save changes</button>
      </div>
    </Sheet>
  )
}

function WaSheet({ o, onClose }: { o: Order; onClose: () => void }) {
  const { settings: s } = useDb()
  const [key, setKey] = useState<TemplateKey>('approved')
  const [lang, setLang] = useState(o.lang)
  const fill = (k: TemplateKey, l: typeof lang) => fillTemplate(s.templates[k][l], {
    name: o.customer.name, order_number: o.number, date: fmtDate(o.date, l, true), window: windowLabel(s, o.window), total: formatRs(o.total),
    juice_number: s.juice, pickup_address: s.pickupAddress, tracking_link: trackingUrl(o),
  })
  const [text, setText] = useState(fill('approved', o.lang))
  return (
    <Sheet title="WhatsApp" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Template"><select className={inputCls} value={key} onChange={(e) => { const k = e.target.value as TemplateKey; setKey(k); setText(fill(k, lang)) }}>{TEMPLATES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Language"><select className={inputCls} value={lang} onChange={(e) => { const l = e.target.value as typeof lang; setLang(l); setText(fill(key, l)) }}><option value="en">English</option><option value="fr">Français</option></select></Field>
        <Field label="Message (editable)"><textarea className={inputCls} rows={6} value={text} onChange={(e) => setText(e.target.value)} /></Field>
        <a className={btn('primary', 'w-full')} href={waLink(o.customer.phone, text)} target="_blank" rel="noreferrer">Open WhatsApp</a>
      </div>
    </Sheet>
  )
}
