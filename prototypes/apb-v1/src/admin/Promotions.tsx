import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { promoStatus } from '../domain/pricing'
import { localInputToMs, msToLocalInput } from '../domain/time'
import type { Promotion } from '../domain/types'
import { newId, nowMs, updateDb, useDb, useNow } from '../mocks/store'
import { Badge, btn, Field, inputCls } from '../ui/ui'
import { fmtStamp } from '../domain/time'

export function Promotions() {
  const db = useDb()
  const now = useNow()
  return (
    <div className="space-y-3">
      <Link to="/admin/menu" className="inline-flex min-h-11 items-center text-sm font-semibold text-honey-700">&lsaquo; Menu</Link>
      <div className="flex items-center justify-between"><h1 className="text-3xl">Promotions</h1><Link to="/admin/promotions/new" className={btn()}>+ New</Link></div>
      {db.promotions.map((p) => {
        const st = promoStatus(p, now)
        return (
          <Link key={p.id} to={`/admin/promotions/${p.id}`} className="block rounded-card border border-honey-200 bg-paper p-3">
            <div className="flex justify-between gap-2"><p className="font-semibold">{p.title.en}</p><Badge tone={st === 'live' ? 'green' : st === 'scheduled' ? 'amber' : 'grey'}>{st}</Badge></div>
            <p className="text-xs text-ink-soft">{fmtStamp(p.startMs)} to {fmtStamp(p.endMs)} · {[p.showBanner && 'banner', p.showCard && 'card'].filter(Boolean).join(' + ')}</p>
          </Link>
        )
      })}
    </div>
  )
}

export function PromoEditor() {
  const { id } = useParams()
  const db = useDb()
  const nav = useNavigate()
  const existing = db.promotions.find((p) => p.id === id)
  const [p, setP] = useState<Promotion>(() => existing ?? {
    id: newId('promo'), title: { en: '', fr: '' }, text: { en: '', fr: '' }, startMs: nowMs(), endMs: nowMs() + 7 * 86400000, active: true,
    showBanner: true, showCard: true, link: { kind: 'none' }, items: [],
  })
  const item = p.items[0]
  const save = () => {
    if (!p.title.en.trim()) return
    const fixed = { ...p, title: { ...p.title, fr: p.title.fr || p.title.en }, text: { ...p.text, fr: p.text.fr || p.text.en } }
    updateDb((d) => ({ ...d, promotions: existing ? d.promotions.map((x) => (x.id === p.id ? fixed : x)) : [...d.promotions, fixed] }))
    nav('/admin/promotions')
  }
  return (
    <div className="space-y-3 pb-8">
      <Link to="/admin/promotions" className="inline-flex min-h-11 items-center text-sm font-semibold text-honey-700">&lsaquo; Promotions</Link>
      <h1 className="text-3xl">{existing ? 'Edit promotion' : 'New promotion'}</h1>
      {(['en', 'fr'] as const).map((l) => <Field key={`t${l}`} label={`Title (${l.toUpperCase()})`}><input className={inputCls} value={p.title[l]} onChange={(e) => setP({ ...p, title: { ...p.title, [l]: e.target.value } })} /></Field>)}
      {(['en', 'fr'] as const).map((l) => <Field key={`x${l}`} label={`Short text (${l.toUpperCase()})`}><input className={inputCls} value={p.text[l]} onChange={(e) => setP({ ...p, text: { ...p.text, [l]: e.target.value } })} /></Field>)}
      <Field label="Start (Mauritius time)"><input className={inputCls} type="datetime-local" value={msToLocalInput(p.startMs)} onChange={(e) => e.target.value && setP({ ...p, startMs: localInputToMs(e.target.value) })} /></Field>
      <Field label="End (Mauritius time)"><input className={inputCls} type="datetime-local" value={msToLocalInput(p.endMs)} onChange={(e) => e.target.value && setP({ ...p, endMs: localInputToMs(e.target.value) })} /></Field>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={p.active} onChange={(e) => setP({ ...p, active: e.target.checked })} />Active (untick to end it early)</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={p.showBanner} onChange={(e) => setP({ ...p, showBanner: e.target.checked })} />Show as top banner</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={p.showCard} onChange={(e) => setP({ ...p, showCard: e.target.checked })} />Show as homepage card</label>
      <Field label="Link to">
        <select className={inputCls} value={p.link.kind === 'product' ? `product:${p.link.ref}` : p.link.kind} onChange={(e) => {
          const v = e.target.value
          setP({ ...p, link: v.startsWith('product:') ? { kind: 'product', ref: v.slice(8) } : { kind: v as 'none' | 'category' | 'custom' } })
        }}>
          <option value="none">Menu</option><option value="custom">Custom cake form</option>
          {db.products.map((x) => <option key={x.id} value={`product:${x.id}`}>{x.name.en}</option>)}
        </select>
      </Field>
      <fieldset className="space-y-2 rounded-card border border-honey-200 bg-paper p-3">
        <legend className="px-1 text-sm font-semibold">Discounted product (base price only)</legend>
        <select className={inputCls} aria-label="Product" value={item?.productId ?? ''} onChange={(e) => setP({ ...p, items: e.target.value ? [{ productId: e.target.value, kind: item?.kind ?? 'percent', value: item?.value ?? 10 }] : [] })}>
          <option value="">No discount</option>{db.products.map((x) => <option key={x.id} value={x.id}>{x.name.en}</option>)}
        </select>
        {item && (
          <div className="grid grid-cols-2 gap-2">
            <select className={inputCls} aria-label="Discount type" value={item.kind} onChange={(e) => setP({ ...p, items: [{ ...item, kind: e.target.value as 'percent' | 'fixed' }] })}><option value="percent">% off</option><option value="fixed">Sale price (Rs)</option></select>
            <input className={inputCls} aria-label="Discount value" inputMode="numeric" value={item.value} onChange={(e) => setP({ ...p, items: [{ ...item, value: Number(e.target.value.replace(/\D/g, '')) }] })} />
          </div>
        )}
      </fieldset>
      <button className={btn('primary', 'w-full')} onClick={save} disabled={!p.title.en.trim()}>Save promotion</button>
    </div>
  )
}
