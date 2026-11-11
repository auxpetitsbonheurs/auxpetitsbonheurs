import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { trackingUrl } from '../mocks/emails'
import { useDb } from '../mocks/store'
import { btn, card } from '../ui/ui'

export function Confirmation() {
  const { token } = useParams()
  const db = useDb()
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const order = db.orders.find((o) => o.token === token)
  if (!order) {
    return (
      <div className="py-12 text-center">
        <h1 className="mb-2 text-3xl">{t('t.notFound')}</h1>
        <Link to="/" className={btn()}>{t('c.home')}</Link>
      </div>
    )
  }
  const url = trackingUrl(order)
  return (
    <div className="space-y-5 py-4 text-center">
      <h1 className="text-3xl text-honey-700">{t('c.title')}</h1>
      <div className={card}>
        <p className="text-sm text-ink-soft">{t('c.number')}</p>
        <p className="font-serif text-4xl font-semibold">{order.number}</p>
      </div>
      <p className="rounded-card bg-amber-100 p-3 font-semibold text-amber-900">
        {order.source === 'custom' ? t('c.requestNote') : t('c.notConfirmed')}
      </p>
      <div className={`${card} text-left`}>
        <p className="mb-1 text-sm font-semibold">{t('c.link')}</p>
        <p className="break-all rounded-xl bg-honey-100 p-2 text-xs">{url}</p>
        <button
          type="button"
          className={btn('outline', 'mt-2')}
          onClick={() => { void navigator.clipboard?.writeText(url); setCopied(true) }}
        >
          {copied ? t('c.copied') : t('c.copy')}
        </button>
      </div>
      <div className="flex flex-col gap-2">
        <Link to={`/order/${order.token}`} className={btn()}>{t('c.track')}</Link>
        <Link to="/" className={btn('ghost')}>{t('c.home')}</Link>
      </div>
    </div>
  )
}
