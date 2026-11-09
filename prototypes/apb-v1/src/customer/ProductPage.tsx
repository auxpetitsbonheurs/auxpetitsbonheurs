import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { earliestDate, noticeFor } from '../domain/availability'
import { formatRs } from '../domain/money'
import {
  bestPrice, defaultSelection, isOrderable, isVisible, priceLine, quantityBounds, quantityGroup, selectionProblems,
} from '../domain/pricing'
import type { Selection } from '../domain/types'
import { useI18n } from '../i18n'
import { todayMU, useDb, useNow } from '../mocks/store'
import { Photo } from '../ui/Art'
import { OptionPicker } from '../ui/OptionPicker'
import { btn, Stepper } from '../ui/ui'
import { addLine, newLineId, replaceLine, useBasket } from './basketStore'

export function ProductPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const editId = params.get('edit')
  const db = useDb()
  const now = useNow()
  const basket = useBasket()
  const nav = useNavigate()
  const { t, tl, lang, date } = useI18n()
  const product = db.products.find((p) => p.id === id)
  const editing = basket.lines.find((l) => l.id === editId && l.productId === id)

  const [sel, setSel] = useState<Selection | null>(null)
  const [photo, setPhoto] = useState(0)
  const [added, setAdded] = useState(false)

  const current = useMemo<Selection | null>(
    () => sel ?? (editing ? editing.selection : product ? defaultSelection(product) : null),
    [sel, editing, product],
  )

  if (!product || !current || !isVisible(product, now)) {
    return (
      <div className="py-12 text-center">
        <p className="mb-4">{t('p.notAvailable')}</p>
        <Link to="/menu" className={btn()}>{t('b.goMenu')}</Link>
      </div>
    )
  }

  const bounds = quantityBounds(product)
  const qGroup = quantityGroup(product)
  const priced = priceLine(product, current, db.promotions, now)
  const best = bestPrice(product, db.promotions, now)
  const problems = selectionProblems(product, current)
  const missingIds = problems.filter((p) => p.reason === 'required').map((p) => p.groupId)
  const missingNames = missingIds.map((gid) => tl(product.groups.find((g) => g.id === gid)!.name))
  const orderable = isOrderable(product, now)

  const basketProducts = basket.lines.filter((l) => l.id !== editId).map((l) => db.products.find((p) => p.id === l.productId)).filter((p): p is NonNullable<typeof p> => !!p)
  const notice = noticeFor([...basketProducts, product], db.settings.defaultNotice)
  const earliest = earliestDate({ today: todayMU(), noticeDays: notice, closedDays: db.settings.closedDays, blocked: db.blocked })

  const submit = () => {
    if (problems.length || !orderable) return
    const line = { id: editing?.id ?? newLineId(), productId: product.id, selection: current, seen: priced.unit }
    if (editing) {
      replaceLine(line)
      nav('/basket')
    } else {
      addLine(line)
      setAdded(true)
    }
  }

  return (
    <article className="pb-24">
      <div className="-mx-4 sm:mx-0">
        <div
          className="snap-x-row flex sm:rounded-3xl"
          onScroll={(e) => setPhoto(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        >
          {product.photos.map((src, i) => (
            <Photo key={src + i} src={src} alt={`${tl(product.name)} ${i + 1}`} className="aspect-square w-full" />
          ))}
        </div>
        {product.photos.length > 1 && (
          <div className="mt-2 flex justify-center gap-1.5" aria-hidden="true">
            {product.photos.map((_, i) => <span key={i} className={`h-2 w-2 rounded-full ${i === photo ? 'bg-rose-600' : 'bg-rose-200'}`} />)}
          </div>
        )}
      </div>

      <h1 className="mt-4 text-3xl font-semibold">{tl(product.name)}</h1>
      <p className="mt-1 text-lg">
        {best.price < best.original && <span className="mr-2 text-ink-soft line-through">{formatRs(best.original)}</span>}
        <span className="font-bold text-rose-700">{formatRs(best.price)}</span>
      </p>
      <p className="mt-2 text-ink-soft">{tl(product.desc)}</p>
      {product.allergens.length > 0 && (
        <p className="mt-3 text-sm">
          <strong>{t('p.contains')}:</strong> {product.allergens.map((a) => t(`al.${a}`)).join(', ')}
        </p>
      )}
      <p className="mt-1 text-xs text-ink-soft">{t('p.kitchenNote')}</p>

      {!orderable ? (
        <p className="mt-6 rounded-2xl bg-stone-200 p-4 text-center font-semibold">{t('p.soldOutNote')}</p>
      ) : (
        <div className="mt-5 space-y-5">
          <OptionPicker product={product} sel={current} onChange={setSel} lang={lang} missing={sel ? missingIds : []} />
          <div>
            <p className="mb-1 text-sm font-semibold">{qGroup ? tl(qGroup.name) : t('p.qty')}</p>
            <Stepper label={t('p.qty')} value={current.qty} min={bounds.min} max={bounds.max} onChange={(qty) => setSel({ ...current, qty })} />
            {qGroup && <p className="mt-1 text-xs text-ink-soft">{t('p.qtyRange', bounds)}</p>}
          </div>
          <p className="rounded-xl bg-rose-50 p-3 text-sm font-semibold">
            {t('p.earliest', { date: date(earliest, true) })}
            {notice > db.settings.defaultNotice && <span className="font-normal text-ink-soft"> ({t('p.notice', { n: notice })})</span>}
          </p>
        </div>
      )}

      {orderable && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rose-100 bg-cream/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-5xl">
            {added ? (
              <div className="flex gap-2">
                <Link to="/menu" className={btn('outline', 'flex-1')}>{t('b.goMenu')}</Link>
                <Link to="/basket" className={btn('primary', 'flex-1')}>{t('p.added')} - {t('nav.basket')}</Link>
              </div>
            ) : (
              <>
                {missingNames.length > 0 && <p className="mb-1 text-center text-xs text-ink-soft">{t('p.chooseFirst', { names: missingNames.join(', ') })}</p>}
                <button
                  type="button"
                  className={btn('primary', 'w-full')}
                  disabled={problems.length > 0}
                  onClick={submit}
                >
                  {editing ? t('p.update') : t('p.add')} &middot; {formatRs(priced.lineTotal)}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </article>
  )
}
