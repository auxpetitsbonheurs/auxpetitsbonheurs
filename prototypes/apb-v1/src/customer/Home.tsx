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
      <section className="flex flex-col items-center gap-3.5 pt-4 text-center">
        <p className="font-subhead text-lg text-wine-700">{tl(db.settings.tagline)}</p>
        <h1 className="max-w-md text-[2.625rem] leading-[1.08] sm:text-[3.5rem]">{t('home.hero')}</h1>
        <span aria-hidden="true" className="h-px w-16 bg-gold" />
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <Link to="/menu" className={btn('primary')}>{t('home.orderNow')}</Link>
          <Link to="/custom" className={btn('outline')}>{t('home.customCake')}</Link>
        </div>
        <Art id="art:cake:0" className="mt-3 h-[250px] w-full overflow-hidden rounded-band sm:h-80" />
      </section>

      {cards.length > 0 && (
        <section aria-labelledby="offers">
          <h2 id="offers" className="section-title mb-3 text-[1.75rem]">{t('home.offers')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {cards.map((p) => (
              <Link
                key={p.id}
                to={p.link.kind === 'product' ? `/product/${p.link.ref}` : p.link.kind === 'custom' ? '/custom' : '/menu'}
                className="block rounded-band bg-cream-dark p-5"
              >
                <p className="font-subhead text-xl">{tl(p.title)}</p>
                <p className="mt-1 text-[15px] text-ink-soft">{tl(p.text)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {seasonal.length > 0 && (
        <section aria-labelledby="seasonal">
          <h2 id="seasonal" className="section-title mb-3 text-[1.75rem]">{t('home.seasonal')}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{seasonal.map((p) => <ProductCard key={p.id} product={p} />)}</div>
        </section>
      )}

      <section aria-labelledby="featured">
        <h2 id="featured" className="section-title mb-3 text-[1.75rem]">{t('home.featured')}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{featured.map((p) => <ProductCard key={p.id} product={p} />)}</div>
      </section>

      <section aria-labelledby="how">
        <h2 id="how" className="section-title mb-3 text-[1.75rem]">{t('home.how')}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map(([title, desc], i) => (
            <li key={title} className="rounded-card border border-wine-200 bg-paper p-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-wine-200 font-serif text-lg text-wine-700">{i + 1}</span>
              <p className="mt-2 font-semibold">{t(title)}</p>
              <p className="text-sm text-ink-soft">{t(desc)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Custom-cake call-out (brand v0.3): burgundy band, cream outline pill. */}
      <section aria-labelledby="custom-band" className="band -mx-4 flex flex-col items-center gap-3 px-6 py-8 text-center sm:mx-0 sm:rounded-band">
        <h2 id="custom-band" className="text-[1.75rem]">{t('home.customBand.t')}</h2>
        <p className="max-w-sm text-cream-muted">{t('home.customBand.d')}</p>
        <Link to="/custom" className={btn('onBand')}>{t('home.customBand.cta')}</Link>
      </section>

      <section aria-labelledby="gal">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="gal" className="text-[1.75rem]">{t('home.gallery')}</h2>
          <Link to="/gallery" className="flex min-h-11 items-center text-sm font-semibold text-wine-700 underline underline-offset-4">{t('common.seeAll')}</Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {GALLERY.slice(0, 6).map((g) => <Photo key={g.id} src={g.art} alt={tl(g.caption)} className="aspect-square overflow-hidden rounded-photo" />)}
        </div>
      </section>
    </div>
  )
}
