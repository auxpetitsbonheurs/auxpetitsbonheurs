import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { dateProblem, earliestDate, noticeFor } from '../domain/availability'
import { formatRs } from '../domain/money'
import { isOrderable, orderTotal, priceLine, quantityBounds } from '../domain/pricing'
import type { Fulfilment } from '../domain/types'
import { useI18n } from '../i18n'
import { placeOrder } from '../mocks/orderActions'
import { todayMU, useDb, useNow } from '../mocks/store'
import { Photo } from '../ui/Art'
import { btn, card, Field, inputCls, qtyLabels, Stepper } from '../ui/ui'
import { clearBasket, patchDraft, patchLine, removeLine, useBasket } from './basketStore'
import { DatePicker } from './DatePicker'

type Errors = Partial<Record<'name' | 'phone' | 'email' | 'address' | 'date' | 'window' | 'policies', string>>

export function Basket() {
  const db = useDb()
  const now = useNow()
  const { lines, draft, submitKey } = useBasket()
  const { t, tl, lang, date } = useI18n()
  const nav = useNavigate()
  const sending = useRef(false)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const [banner, setBanner] = useState('')
  const [policiesOpen, setPoliciesOpen] = useState(false)
  const s = db.settings
  const fulfilment: Fulfilment = draft.fulfilment || 'delivery'
  const delivery = fulfilment === 'delivery'

  const rows = lines.map((l) => {
    const product = db.products.find((p) => p.id === l.productId)
    const priced = product ? priceLine(product, l.selection, db.promotions, now) : null
    return { l, product, priced, unavailable: !product || !isOrderable(product, now), changed: !!priced && priced.unit !== l.seen }
  })

  if (lines.length === 0) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-2 text-3xl">{t('b.title')}</h1>
        <p className="mb-4 text-ink-soft">{t('b.empty')}</p>
        <Link to="/menu" className={btn()}>{t('b.goMenu')}</Link>
      </div>
    )
  }

  const priceable = rows.flatMap((r) => (r.priced ? [r.priced] : []))
  const notice = noticeFor(rows.flatMap((r) => (r.product ? [r.product] : [])), s.defaultNotice)
  const ctx = { today: todayMU(), noticeDays: notice, closedDays: s.closedDays, blocked: db.blocked }
  const earliest = earliestDate(ctx)
  const total = orderTotal(priceable, s.deliveryFee, delivery)
  const dateOk = draft.date && !dateProblem(draft.date, ctx)

  const validate = (): Errors => {
    const e: Errors = {}
    if (!draft.name.trim()) e.name = t('err.name')
    if (!draft.phone.trim()) e.phone = t('err.phone')
    if (!/^\S+@\S+\.\S+$/.test(draft.email)) e.email = t('err.email')
    if (delivery && !draft.address.trim()) e.address = t('err.address')
    if (!dateOk) e.date = t('err.date')
    if (!s.windows.some((w) => w.id === draft.window)) e.window = t('err.window')
    if (!draft.policies) e.policies = t('err.policies')
    return e
  }

  const send = () => {
    if (sending.current) return
    setBanner('')
    const e = validate()
    setErrors(e)
    if (Object.keys(e).length) {
      setBanner(t('b.fix'))
      return
    }
    sending.current = true
    setBusy(true)
    const res = placeOrder({
      lines: lines.map((l) => ({ lineId: l.id, productId: l.productId, selection: l.selection, seen: l.seen })),
      fulfilment, address: draft.address, landmark: draft.landmark, date: draft.date, window: draft.window,
      customer: { name: draft.name.trim(), phone: draft.phone.trim(), email: draft.email.trim() },
      note: draft.note, lang, submitKey,
    })
    if (res.ok) {
      clearBasket()
      nav(`/confirmation/${res.order.token}`)
      return
    }
    sending.current = false
    setBusy(false)
    if (res.error === 'changed') {
      for (const [id, unit] of Object.entries(res.prices ?? {})) patchLine(id, { seen: unit })
      setBanner(t('b.changed'))
    } else if (res.error === 'unavailable') setBanner(t('b.unavailable'))
    else if (res.error === 'date') {
      patchDraft({ date: '' })
      setBanner(t('b.dateGone'))
    } else setBanner(t('b.fix'))
  }

  return (
    <div className="space-y-6 pb-8">
      <h1 className="text-3xl">{t('b.title')}</h1>
      {banner && <p role="alert" className="rounded-card bg-amber-100 p-3 text-sm font-semibold text-amber-900">{banner}</p>}

      <section aria-labelledby="items" className="space-y-3">
        <h2 id="items" className="text-xl">{t('b.items')}</h2>
        {rows.map(({ l, product, priced, unavailable, changed }) => (
          <div key={l.id} className={`${card} flex gap-3 ${unavailable ? 'opacity-60' : ''}`}>
            {product && <Photo src={product.photos[0] ?? 'art:cake:0'} alt={tl(product.name)} className="h-20 w-20 shrink-0 overflow-hidden rounded-xl" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{product ? tl(product.name) : '?'}</p>
              {priced && (
                <p className="text-xs text-ink-soft">
                  {[...priced.options.map((o) => tl(o.choice)), priced.message ? `"${priced.message}"` : ''].filter(Boolean).join(' · ')}
                </p>
              )}
              {unavailable && <p className="text-sm font-semibold text-red-700">{t('b.unavailable')}</p>}
              {priced && !unavailable && (
                <p className="mt-1 text-sm">
                  {priced.originalBase > priced.basePrice && <span className="mr-1 text-ink-soft line-through">{formatRs(priced.originalBase)}</span>}
                  <strong>{formatRs(priced.lineTotal)}</strong>
                  {changed && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">{t('b.newPrice', { price: formatRs(priced.unit) })}</span>}
                </p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {product && !unavailable && (() => {
                  const b = quantityBounds(product)
                  return <Stepper {...qtyLabels(t, tl(product.name))} value={l.selection.qty} min={b.min} max={b.max} onChange={(qty) => patchLine(l.id, { selection: { ...l.selection, qty } })} />
                })()}
                {product && !unavailable && <Link to={`/product/${product.id}?edit=${l.id}`} className="flex min-h-11 items-center px-2 text-sm font-semibold text-honey-700">{t('common.edit')}</Link>}
                <button type="button" className="min-h-11 px-2 text-sm font-semibold text-red-700" onClick={() => removeLine(l.id)}>{t('common.remove')}</button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="how" className="space-y-3">
        <h2 id="how" className="text-xl">{t('b.how')}</h2>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('b.how')}>
          {(['delivery', 'pickup'] as Fulfilment[]).map((f) => (
            <label key={f} className={`flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-card border p-3 text-center font-semibold ${fulfilment === f ? 'border-honey-600 bg-honey-100' : 'border-honey-200 bg-paper'}`}>
              <input type="radio" name="fulfilment" aria-label={t(`b.${f}`)} className="sr-only" checked={fulfilment === f} onChange={() => patchDraft({ fulfilment: f })} />
              {t(`b.${f}`)}
              <span className="text-xs font-normal text-ink-soft">{f === 'delivery' ? `+ ${formatRs(s.deliveryFee)}` : t('common.free')}</span>
            </label>
          ))}
        </div>
        {delivery ? (
          <>
            <Field label={t('b.address')} error={errors.address}>
              <textarea className={inputCls} rows={2} autoComplete="street-address" value={draft.address} onChange={(e) => patchDraft({ address: e.target.value })} />
            </Field>
            <Field label={t('b.landmark')}>
              <input className={inputCls} value={draft.landmark} onChange={(e) => patchDraft({ landmark: e.target.value })} />
            </Field>
          </>
        ) : (
          <div className={card}>
            <p className="text-sm font-semibold">{t('b.pickupAt')}</p>
            <p className="text-sm">{s.pickupAddress}</p>
            <a className="flex min-h-11 items-center text-sm font-semibold text-honey-700" href={s.mapLink} target="_blank" rel="noreferrer">{t('b.map')}</a>
          </div>
        )}
      </section>

      <section aria-labelledby="date" className="space-y-3">
        <h2 id="date" className="text-xl">{t('b.date')}</h2>
        <p className="text-sm text-ink-soft">{t('b.dateHelp')} {t('b.earliest', { date: date(earliest, true) })}</p>
        <DatePicker value={draft.date} ctx={ctx} onChange={(d) => patchDraft({ date: d })} />
        <p className="text-sm font-semibold" aria-live="polite">{dateOk ? t('b.selected', { date: date(draft.date, true) }) : t('b.noDate')}</p>
        {errors.date && <p role="alert" className="text-xs font-semibold text-red-700">{errors.date}</p>}
        <fieldset>
          <legend className="mb-1 text-sm font-semibold">{t('b.window')}</legend>
          <div className="space-y-1">
            {s.windows.map((w) => (
              <label key={w.id} className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 ${draft.window === w.id ? 'border-honey-600 bg-honey-100' : 'border-honey-200 bg-paper'}`}>
                <input type="radio" name="window" aria-label={`${tl(w.name)} ${w.from}-${w.to}`} className="h-5 w-5 accent-honey-600" checked={draft.window === w.id} onChange={() => patchDraft({ window: w.id })} />
                <span className="text-sm font-semibold">{tl(w.name)}</span>
                <span className="text-sm text-ink-soft">{w.from}-{w.to}</span>
              </label>
            ))}
          </div>
          {errors.window && <p role="alert" className="mt-1 text-xs font-semibold text-red-700">{errors.window}</p>}
        </fieldset>
      </section>

      <section aria-labelledby="details" className="space-y-3">
        <h2 id="details" className="text-xl">{t('b.details')}</h2>
        <Field label={t('b.name')} error={errors.name}><input className={inputCls} autoComplete="name" value={draft.name} onChange={(e) => patchDraft({ name: e.target.value })} /></Field>
        <Field label={t('b.phone')} error={errors.phone}><input className={inputCls} type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} onChange={(e) => patchDraft({ phone: e.target.value })} /></Field>
        <Field label={t('b.email')} error={errors.email}><input className={inputCls} type="email" inputMode="email" autoComplete="email" value={draft.email} onChange={(e) => patchDraft({ email: e.target.value })} /></Field>
        <Field label={t('b.note')}><textarea className={inputCls} rows={2} value={draft.note} onChange={(e) => patchDraft({ note: e.target.value })} /></Field>
      </section>

      <section className="space-y-2">
        <label className="flex min-h-11 items-start gap-3">
          <input type="checkbox" aria-label={t('b.policies')} className="mt-2 h-5 w-5 accent-honey-600" checked={draft.policies} onChange={(e) => patchDraft({ policies: e.target.checked })} />
          <span className="pt-2 text-sm">{t('b.policies')}</span>
        </label>
        <button type="button" className="min-h-11 text-sm font-semibold text-honey-700" onClick={() => setPoliciesOpen(!policiesOpen)}>{t('b.readPolicies')}</button>
        {policiesOpen && <p className="whitespace-pre-line rounded-card bg-paper p-3 text-sm">{tl(s.policies)}</p>}
        {errors.policies && <p role="alert" className="text-xs font-semibold text-red-700">{errors.policies}</p>}
      </section>

      <section className={card} aria-labelledby="sum">
        <h2 id="sum" className="mb-2 text-xl">{t('b.summary')}</h2>
        <dl className="space-y-1 text-sm">
          <div className="flex justify-between"><dt>{t('b.subtotal')}</dt><dd>{formatRs(total - (delivery ? s.deliveryFee : 0))}</dd></div>
          {delivery && <div className="flex justify-between"><dt>{t('b.deliveryFee')}</dt><dd>{formatRs(s.deliveryFee)}</dd></div>}
          <div className="flex justify-between border-t border-honey-200 pt-2 text-lg font-semibold"><dt>{t('b.total')}</dt><dd>{formatRs(total)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-ink-soft">{t('b.payNote')}</p>
        <button type="button" className={btn('primary', 'mt-3 w-full')} disabled={busy} onClick={send}>{busy ? t('b.sending') : t('b.send')}</button>
      </section>
    </div>
  )
}
