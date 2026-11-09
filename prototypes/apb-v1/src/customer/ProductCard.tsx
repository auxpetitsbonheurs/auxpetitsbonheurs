import { Link } from 'react-router-dom'
import type { Product } from '../domain/types'
import { bestPrice } from '../domain/pricing'
import { formatRs } from '../domain/money'
import { useI18n } from '../i18n'
import { useDb, useNow } from '../mocks/store'
import { Photo } from '../ui/Art'

export function ProductCard({ product: p }: { product: Product }) {
  const db = useDb()
  const now = useNow()
  const { t, tl } = useI18n()
  const best = bestPrice(p, db.promotions, now)
  const onSale = best.price < best.original
  const soldOut = p.status === 'soldout'
  return (
    <Link to={`/product/${p.id}`} className="block overflow-hidden rounded-2xl bg-white shadow-soft transition hover:-translate-y-0.5">
      <div className="relative aspect-square">
        <Photo src={p.photos[0] ?? 'art:cake:0'} alt={tl(p.name)} className={`h-full w-full ${soldOut ? 'opacity-50 grayscale' : ''}`} />
        {onSale && (
          <span className="absolute left-2 top-2 rounded-full bg-rose-600 px-2.5 py-1 text-xs font-bold text-white">
            -{Math.round((1 - best.price / best.original) * 100)}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-xs font-bold text-white">
            {t('common.soldOut')}
          </span>
        )}
      </div>
      <div className="p-3">
        <h3 className="text-base font-semibold leading-snug">{tl(p.name)}</h3>
        <p className="mt-1 text-sm">
          {onSale ? (
            <>
              <span className="mr-2 text-ink-soft line-through">{formatRs(best.original)}</span>
              <span className="font-bold text-rose-700">{t('common.from', { price: formatRs(best.price) })}</span>
            </>
          ) : (
            <span className="font-semibold">{t('common.from', { price: formatRs(best.price) })}</span>
          )}
        </p>
      </div>
    </Link>
  )
}
