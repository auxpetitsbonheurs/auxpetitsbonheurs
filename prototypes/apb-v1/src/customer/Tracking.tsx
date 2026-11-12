import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatRs } from '../domain/money'
import { quoteExpired } from '../domain/quote'
import { canCustomerCancel, isClosedOut, progressSteps } from '../domain/status'
import { waLink } from '../domain/whatsapp'
import { useI18n, type Key } from '../i18n'
import { customerAnswerQuote, customerCancel } from '../mocks/orderActions'
import { todayMU, useDb } from '../mocks/store'
import { Photo } from '../ui/Art'
import { Badge, btn, card } from '../ui/ui'

export function Tracking() {
  const { token } = useParams()
  const db = useDb()
  const { t, tl, date } = useI18n()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [error, setError] = useState('')
  const o = db.orders.find((x) => x.token === token)

  if (!o) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-2 text-3xl">{t('t.notFound')}</h1>
        <p className="mb-4 text-ink-soft">{t('t.notFoundText')}</p>
        <Link to="/" className={btn()}>{t('c.home')}</Link>
      </div>
    )
  }
  const s = db.settings
  const win = s.windows.find((w) => w.id === o.window)
  const steps = progressSteps(o)
  const idx = steps.findIndex((st) => st.key === o.status)
  const closed = isClosedOut(o.status)
  const expired = !!o.quote && quoteExpired(o.quote, todayMU())
  const wa = waLink(s.whatsapp, t('t.waText', { number: o.number }))

  const run = (fn: () => { ok: boolean; error?: string }) => {
    const r = fn()
    setError(r.ok ? '' : (r as { error: string }).error)
    setConfirmCancel(false)
  }

  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">{o.number}</h1>
        <Badge tone={closed ? 'grey' : 'wine'}>{t(`st.${o.status}` as Key)}</Badge>
      </div>

      {closed ? (
        <p className="rounded-card bg-stone-200 p-3 font-semibold">{t(`st.${o.status}` as Key)}{o.declineReason ? ` - ${t('t.reason')}: ${o.declineReason}` : ''}</p>
      ) : (
        <ol className="flex" aria-label={t('t.title')}>
          {steps.map((st, i) => (
            <li key={st.key} className="flex-1 text-center" aria-current={i === idx ? 'step' : undefined}>
              <div className="flex items-center">
                <span className={`h-1 flex-1 ${i === 0 ? 'bg-transparent' : i <= idx ? 'bg-wine-600' : 'bg-wine-200'}`} />
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i <= idx ? 'bg-wine-600 text-paper' : 'bg-wine-200 text-ink-soft'}`}>{i < idx ? '✓' : i + 1}</span>
                <span className={`h-1 flex-1 ${i === steps.length - 1 ? 'bg-transparent' : i < idx ? 'bg-wine-600' : 'bg-wine-200'}`} />
              </div>
              <p className={`mt-1 px-0.5 text-[11px] leading-tight ${i === idx ? 'font-semibold text-wine-700' : 'text-ink-soft'}`}>{t(st.label as Key)}</p>
            </li>
          ))}
        </ol>
      )}

      {o.status === 'pending' && <p className="rounded-card bg-amber-100 p-3 text-sm font-semibold text-amber-900">{t('c.notConfirmed')}</p>}
      {error && <p role="alert" className="rounded-card bg-red-100 p-3 text-sm font-semibold text-red-800">{error === 'quote_expired' ? t('t.expired') : error}</p>}

      {o.quote && (o.status === 'quote_sent' || o.status === 'approved' || o.status === 'closed') && (
        <section className={`${card} border-2 border-wine-200`} aria-labelledby="quote">
          <h2 id="quote" className="text-xl">{t('t.quote')}</h2>
          <p className="mt-1 text-2xl font-semibold text-wine-700">{formatRs(o.quote.amount)}</p>
          {o.quote.note && <p className="text-sm"><strong>{t('t.quoteNote')}:</strong> {o.quote.note}</p>}
          <p className={`text-sm ${expired ? 'font-semibold text-red-700' : 'text-ink-soft'}`}>{t('t.expires', { date: date(o.quote.expiry, true) })}</p>
          {o.status === 'quote_sent' && (expired ? (
            <div className="mt-2 space-y-2">
              <p className="text-sm font-semibold text-red-700">{t('t.expired')}</p>
              <Link to="/custom" className={btn('outline')}>{t('t.newRequest')}</Link>
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" className={btn('primary', 'flex-1')} onClick={() => run(() => customerAnswerQuote(o.token, true))}>{t('t.accept')}</button>
              <button type="button" className={btn('outline', 'flex-1')} onClick={() => run(() => customerAnswerQuote(o.token, false))}>{t('t.decline')}</button>
            </div>
          ))}
        </section>
      )}

      <section className={card} aria-labelledby="details">
        <h2 id="details" className="mb-2 text-xl">{o.custom ? t('t.request') : t('t.items')}</h2>
        {o.items.map((it) => (
          <div key={it.id} className="flex justify-between gap-3 border-b border-wine-100 py-2 text-sm last:border-0">
            <div>
              <p className="font-semibold">{it.qty} x {tl(it.name)}</p>
              <p className="text-xs text-ink-soft">{[...it.options.map((x) => tl(x.choice)), it.message ? `"${it.message}"` : ''].filter(Boolean).join(' · ')}</p>
            </div>
            <span>{formatRs(it.lineTotal)}</span>
          </div>
        ))}
        {o.custom && (
          <div className="space-y-1 text-sm">
            <p><strong>{t('cu.occasion')}:</strong> {t(`occ.${o.custom.occasion}` as Key)}</p>
            <p><strong>{t('cu.servings')}:</strong> {o.custom.servings}</p>
            <p><strong>{t('cu.flavours')}:</strong> {o.custom.flavours}</p>
            <p><strong>{t('cu.theme')}:</strong> {o.custom.theme}</p>
            {o.custom.text && <p><strong>{t('cu.text')}:</strong> {o.custom.text}</p>}
            <div className="flex gap-2 pt-1">
              {o.custom.photos.map((p, i) => <Photo key={i} src={p} alt={`${t('cu.photos')} ${i + 1}`} className="h-16 w-16 overflow-hidden rounded-lg" />)}
            </div>
          </div>
        )}
        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex justify-between"><dt>{t('t.date')}</dt><dd className="font-semibold">{date(o.date, true)}</dd></div>
          {win && <div className="flex justify-between"><dt>{t('t.window')}</dt><dd className="font-semibold">{tl(win.name)} {win.from}-{win.to}</dd></div>}
          <div className="flex justify-between"><dt>{t('t.method')}</dt><dd className="text-right font-semibold">{o.fulfilment === 'delivery' ? `${t('b.delivery')}: ${o.address}` : `${t('b.pickup')}: ${s.pickupAddress}`}</dd></div>
          {o.total > 0 && <div className="flex justify-between border-t border-wine-200 pt-2 text-lg font-semibold"><dt>{t('t.total')}</dt><dd>{formatRs(o.total)}</dd></div>}
          {o.total > 0 && <div className="flex justify-between"><dt /><dd><Badge tone={o.paid ? 'green' : 'amber'}>{o.paid ? t('t.paid') : t('t.unpaid')}</Badge></dd></div>}
        </dl>
      </section>

      {canCustomerCancel(o.status) ? (
        confirmCancel ? (
          <div className={card}>
            <p className="mb-2 font-semibold">{t('t.cancelAsk')}</p>
            <div className="flex gap-2">
              <button type="button" className={btn('danger', 'flex-1')} onClick={() => run(() => customerCancel(o.token))}>{t('t.yesCancel')}</button>
              <button type="button" className={btn('outline', 'flex-1')} onClick={() => setConfirmCancel(false)}>{t('t.keep')}</button>
            </div>
          </div>
        ) : (
          <button type="button" className={btn('danger', 'w-full')} onClick={() => setConfirmCancel(true)}>{t('t.cancel')}</button>
        )
      ) : !closed && o.status !== 'completed' ? (
        <p className="text-sm text-ink-soft">{t('t.contact')}</p>
      ) : null}

      <a href={wa} target="_blank" rel="noreferrer" className={btn('outline', 'w-full')}>{t('t.whatsapp')}</a>
    </div>
  )
}
