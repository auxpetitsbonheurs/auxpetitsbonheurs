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
    <Link to={`/product/${p.id}`} className="flex flex-col gap-2 rounded-card border border-honey-200 bg-paper p-2 pb-3.5 transition-colors hover:border-honey-600">
      <div className="relative aspect-square overflow-hidden rounded-photo">
        <Photo src={p.photos[0] ?? 'art:cake:0'} alt={tl(p.name)} className={`h-full w-full ${soldOut ? 'opacity-50 grayscale' : ''}`} />
        {onSale && (
          <span className="absolute left-2 top-2 rounded-lg bg-honey-600 px-2 py-0.5 text-xs font-semibold text-paper">
            -{Math.round((1 - best.price / best.original) * 100)}%
          </span>
        )}
        {soldOut && (
          <span className="absolute inset-x-0 bottom-3 mx-auto w-fit rounded-full bg-ink px-3 py-1 text-xs font-semibold text-paper">
            {t('common.soldOut')}
          </span>
        )}
      </div>
      <div className="px-1">
        <h3 className="text-[17px] leading-snug">{tl(p.name)}</h3>
        <p className="mt-1 text-sm">
          {onSale ? (
            <>
              <span className="mr-2 text-ink-soft line-through">{formatRs(best.original)}</span>
              <span className="font-semibold text-honey-700">{t('common.from', { price: formatRs(best.price) })}</span>
            </>
          ) : (
            <span className="font-semibold">{t('common.from', { price: formatRs(best.price) })}</span>
          )}
        </p>
      </div>
    </Link>
  )
}
