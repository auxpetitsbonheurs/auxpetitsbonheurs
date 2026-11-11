import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useDb, useNow } from '../mocks/store'
import { useBasket } from './basketStore'
import { isLive } from '../domain/pricing'
import { waLink } from '../domain/whatsapp'
import type { Lang } from '../domain/types'

/** Banner dismissals last for the visit (sessionStorage), not forever. */
const dismissed = (() => {
  const mk = () => {
    try { return new Set<string>(JSON.parse(sessionStorage.getItem('apb-v1-dismissed') ?? '[]') as string[]) } catch { return new Set<string>() }
  }
  let s = mk()
  return {
    has: (id: string) => s.has(id),
    add: (id: string) => { s = new Set(s).add(id); sessionStorage.setItem('apb-v1-dismissed', JSON.stringify([...s])); },
  }
})()

function PromoBanner() {
  const db = useDb()
  const now = useNow()
  const { tl, t } = useI18n()
  const [, force] = useState(0)
  const promo = db.promotions.find((p) => isLive(p, now) && p.showBanner && !dismissed.has(p.id))
  if (!promo) return null
  const to = promo.link.kind === 'product' ? `/product/${promo.link.ref}` : promo.link.kind === 'custom' ? '/custom' : '/menu'
  return (
    <div className="flex items-center gap-2 bg-cream-dark px-3 py-1 text-sm text-ink">
      <Link to={to} className="flex min-h-11 flex-1 items-center font-semibold text-honey-700 underline underline-offset-4">{tl(promo.title)}</Link>
      <button
        type="button"
        aria-label={t('banner.dismiss')}
        className="min-h-11 min-w-11 text-xl"
        onClick={() => { dismissed.add(promo.id); force((n) => n + 1) }}
      >
        &times;
      </button>
    </div>
  )
}

/** Language link (brand D4): names the other language in that language, e.g. "Français". */
function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  const other: Lang = lang === 'en' ? 'fr' : 'en'
  return (
    <button
      type="button"
      lang={other}
      aria-label={`${t('lang.switch')}: ${other === 'fr' ? 'Français' : 'English'}`}
      onClick={() => setLang(other)}
      className="min-h-11 rounded-xl px-1.5 text-sm text-ink underline underline-offset-4 hover:text-honey-800"
    >
      {other === 'fr' ? 'Français' : 'English'}
    </button>
  )
}

function TopBar() {
  const { t } = useI18n()
  const basket = useBasket()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const links: [string, Parameters<typeof t>[0]][] = [
    ['/', 'nav.home'], ['/menu', 'nav.menu'], ['/custom', 'nav.custom'], ['/gallery', 'nav.gallery'], ['/about', 'nav.about'], ['/contact', 'nav.contact'],
  ]
  const icon = 'relative flex min-h-11 min-w-11 items-center justify-center rounded-xl text-ink hover:bg-honey-100'
  return (
    <header className="sticky top-0 z-30 border-b border-honey-200 bg-cream">
      {/* DOM order = visual order: language, wordmark, basket + menu. The wordmark stays centred. */}
      <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-1 px-2 py-1 sm:px-4">
        <div className="justify-self-start"><LangSwitch /></div>
        <Link to="/" className="flex min-h-11 items-center px-1 text-center font-serif text-lg leading-tight text-ink min-[400px]:text-[22px]">
          {t('brand')}
        </Link>
        <div className="flex items-center justify-self-end">
          <button type="button" onClick={() => nav('/basket')} aria-label={`${t('nav.basket')} (${basket.lines.length})`} className={icon}>
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M5 8h14l-1.5 12h-11z" strokeLinejoin="round" /><path d="M9 8a3 3 0 0 1 6 0" />
            </svg>
            {basket.lines.length > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-honey-600 px-1 text-xs font-semibold text-paper">
                {basket.lines.length}
              </span>
            )}
          </button>
          <button type="button" aria-expanded={open} aria-label={open ? t('nav.close') : t('nav.open')} onClick={() => setOpen(!open)} className={icon}>
            <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-honey-200 bg-cream px-3 pb-3" aria-label="Main">
          {links.map(([to, key]) => (
            <NavLink key={to} to={to} end onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-11 items-center px-2 font-semibold ${isActive ? 'text-honey-700 underline underline-offset-4' : ''}`}>
              {t(key)}
            </NavLink>
          ))}
        </nav>
      )}
    </header>
  )
}

function Footer() {
  const { t, tl } = useI18n()
  const { settings: s } = useDb()
  const a = 'flex min-h-11 items-center font-semibold text-honey-700 underline underline-offset-4 hover:text-honey-800'
  return (
    <footer className="mt-12 bg-cream-dark px-4 pb-28 pt-8">
      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
        <div>
          <p className="font-serif text-xl">{t('brand')}</p>
          <p className="text-sm text-ink-soft">{tl(s.tagline)}</p>
          <p className="mt-3 text-sm font-semibold">{t('f.pickup')}</p>
          <p className="text-sm">{s.pickupAddress}</p>
          <a className={a} href={s.mapLink} target="_blank" rel="noreferrer">{t('b.map')}</a>
        </div>
        <div>
          <a className={a} href={waLink(s.whatsapp, '')} target="_blank" rel="noreferrer">{t('f.whatsapp')}</a>
          <a className={a} href={`tel:${s.phone.replace(/\s/g, '')}`}>{t('f.call')}: {s.phone}</a>
          <a className={a} href={`mailto:${s.email}`}>{s.email}</a>
          <a className={a} href={s.instagram} target="_blank" rel="noreferrer">{t('f.instagram')}</a>
          <Link className={a} to="/contact">{t('ct.faq')} / {t('ct.policies')}</Link>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-5xl text-xs text-ink-soft">{t('f.privacy')}</p>
    </footer>
  )
}

export function CustomerLayout() {
  return (
    <div className="min-h-screen">
      <PromoBanner />
      <TopBar />
      <main className="mx-auto max-w-5xl px-4 pt-4"><Outlet /></main>
      <Footer />
    </div>
  )
}
