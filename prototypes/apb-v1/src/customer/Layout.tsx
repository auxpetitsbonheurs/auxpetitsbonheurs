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
    <div className="flex items-center gap-2 bg-rose-600 px-3 py-2 text-sm text-white">
      <Link to={to} className="flex min-h-11 flex-1 items-center font-semibold underline-offset-2 hover:underline">{tl(promo.title)}</Link>
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

function LangSwitch() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t('lang.switch')} className="flex overflow-hidden rounded-full border border-rose-200 text-sm font-semibold">
      {(['en', 'fr'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-11 min-w-11 uppercase ${lang === l ? 'bg-rose-600 text-white' : 'bg-white text-ink'}`}
        >
          {l}
        </button>
      ))}
    </div>
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
  return (
    <header className="sticky top-0 z-30 border-b border-rose-100 bg-cream/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-2 px-3">
        <Link to="/" className="mr-auto flex min-h-11 items-center font-serif text-lg font-semibold leading-tight text-rose-700">
          {t('brand')}
        </Link>
        <LangSwitch />
        <button type="button" onClick={() => nav('/basket')} aria-label={`${t('nav.basket')} (${basket.lines.length})`} className="relative min-h-11 min-w-11 rounded-full text-xl hover:bg-rose-50">
          <svg viewBox="0 0 24 24" className="mx-auto h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
            <path d="M5 8h14l-1.200 11H6.200L5 8zM9 8a3 3 0 016 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {basket.lines.length > 0 && (
            <span className="absolute right-0 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-xs font-bold text-white">
              {basket.lines.length}
            </span>
          )}
        </button>
        <button type="button" aria-expanded={open} aria-label={open ? t('nav.close') : t('nav.open')} onClick={() => setOpen(!open)} className="min-h-11 min-w-11 rounded-full text-2xl hover:bg-rose-50">
          {open ? '×' : '☰'}
        </button>
      </div>
      {open && (
        <nav className="border-t border-rose-100 bg-cream px-3 pb-3" aria-label="Main">
          {links.map(([to, key]) => (
            <NavLink key={to} to={to} end onClick={() => setOpen(false)} className={({ isActive }) => `flex min-h-11 items-center px-2 font-semibold ${isActive ? 'text-rose-700' : ''}`}>
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
  const a = 'flex min-h-11 items-center font-semibold text-rose-700 underline-offset-2 hover:underline'
  return (
    <footer className="mt-12 bg-rose-100/60 px-4 pb-28 pt-8">
      <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2">
        <div>
          <p className="font-serif text-lg font-semibold">{t('brand')}</p>
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
