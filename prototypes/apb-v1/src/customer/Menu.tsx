import { useState } from 'react'
import type { Allergen, ProductType } from '../domain/types'
import { isVisible } from '../domain/pricing'
import { useI18n } from '../i18n'
import { useDb, useNow } from '../mocks/store'
import { Chip } from '../ui/ui'
import { ProductCard } from './ProductCard'

const TYPES: ProductType[] = ['cake', 'cupcake', 'dessert', 'seasonal']
const FREE_FROM: Allergen[] = ['egg', 'nuts', 'milk', 'gluten']

export function Menu() {
  const db = useDb()
  const now = useNow()
  const { t } = useI18n()
  const [type, setType] = useState<ProductType | 'all'>('all')
  const [free, setFree] = useState<Allergen[]>([])

  const list = db.products
    .filter((p) => isVisible(p, now))
    .filter((p) => type === 'all' || p.type === type)
    .filter((p) => free.every((a) => !p.allergens.includes(a)))
    .sort((a, b) => a.sort - b.sort)

  return (
    <div>
      <h1 className="mb-3 text-3xl">{t('menu.title')}</h1>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label={t('menu.title')}>
        <Chip active={type === 'all'} onClick={() => setType('all')}>{t('menu.all')}</Chip>
        {TYPES.map((k) => <Chip key={k} active={type === k} onClick={() => setType(k)}>{t(`type.${k}`)}</Chip>)}
      </div>
      <div className="-mx-4 mt-1 flex items-center gap-2 overflow-x-auto px-4 pb-2" role="group" aria-label={t('menu.freeFrom')}>
        <span className="shrink-0 text-sm font-semibold text-ink-soft">{t('menu.freeFrom')}</span>
        {FREE_FROM.map((a) => (
          <Chip key={a} active={free.includes(a)} onClick={() => setFree(free.includes(a) ? free.filter((x) => x !== a) : [...free, a])}>
            {t(`free.${a}`)}
          </Chip>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="mt-8 text-center text-ink-soft">{t('menu.empty')}</p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {list.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  )
}
