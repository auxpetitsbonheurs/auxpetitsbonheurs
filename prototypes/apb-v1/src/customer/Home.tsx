import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useDb, useNow } from '../mocks/store'
import { isLive, isVisible } from '../domain/pricing'
import { btn } from '../ui/ui'
import { Art, Photo } from '../ui/Art'
import { GALLERY } from '../mocks/gallery'
import { ProductCard } from './ProductCard'

export function Home() {
  const db = useDb()
  const now = useNow()
  const { t, tl } = useI18n()
  const cards = db.promotions.filter((p) => isLive(p, now) && p.showCard)
  const seasonal = db.products.filter((p) => p.type === 'seasonal' && isVisible(p, now))
  const featured = db.settings.featured.map((id) => db.products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => !!p && isVisible(p, now))
  const steps = [
    ['home.step1.t', 'home.step1.d'], ['home.step2.t', 'home.step2.d'], ['home.step3.t', 'home.step3.d'],
  ] as const
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-3xl bg-rose-100 p-6 pt-8">
        <div className="relative z-10 max-w-[60%] sm:max-w-md">
          <h1 className="text-3xl font-semibold leading-tight text-rose-700 sm:text-4xl">{t('home.hero')}</h1>
          <p className="mt-2 text-sm text-ink-soft">{tl(db.settings.tagline)}</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link to="/menu" className={btn('primary')}>{t('home.orderNow')}</Link>
            <Link to="/custom" className={btn('outline')}>{t('home.customCake')}</Link>
          </div>
        </div>
        <Art id="art:cake:0" className="absolute -right-8 bottom-0 h-52 w-52 rounded-full opacity-90 sm:right-8 sm:h-72 sm:w-72" />
      </section>

      {cards.length > 0 && (
        <section aria-labelledby="offers">
          <h2 id="offers" className="mb-3 text-2xl font-semibold">{t('home.offers')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((p) => (
              <Link
                key={p.id}
                to={p.link.kind === 'product' ? `/product/${p.link.ref}` : p.link.kind === 'custom' ? '/custom' : '/menu'}
                className="block rounded-2xl border border-rose-200 bg-white p-4 shadow-soft"
              >
                <p className="font-serif text-lg font-semibold text-rose-700">{tl(p.title)}</p>
                <p className="mt-1 text-sm text-ink-soft">{tl(p.text)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seasonal.length > 0 && (
        <section aria-labelledby="seasonal">
          <h2 id="seasonal" className="mb-3 text-2xl font-semibold">{t('home.seasonal')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{seasonal.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}

      <section aria-labelledby="featured">
        <h2 id="featured" className="mb-3 text-2xl font-semibold">{t('home.featured')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{featured.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="mb-3 text-2xl font-semibold">{t('home.how')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(([title, desc], i) => (
            <li key={title} className="rounded-2xl bg-white p-4 shadow-soft">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose-100 font-serif font-bold text-rose-700">{i + 1}</span>
              <p className="mt-2 font-semibold">{t(title)}</p>
              <p className="text-sm text-ink-soft">{t(desc)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="gal">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="gal" className="text-2xl font-semibold">{t('home.gallery')}</h2>
          <Link to="/gallery" className="flex min-h-11 items-center text-sm font-semibold text-rose-700">{t('common.seeAll')}</Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GALLERY.slice(0, 6).map((g) => <Photo key={g.id} src={g.art} alt={tl(g.caption)} className="aspect-square overflow-hidden rounded-xl" />)}
        </div>
      </section>
    </div>
  )
}
