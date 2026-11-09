import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useI18n, type Key } from '../i18n'
import { useDb } from '../mocks/store'
import { GALLERY, OCCASIONS } from '../mocks/gallery'
import { Art, Photo } from '../ui/Art'
import { btn, Chip, Sheet } from '../ui/ui'
import { waLink } from '../domain/whatsapp'

export function Gallery() {
  const { t, tl } = useI18n()
  const [occ, setOcc] = useState('all')
  const [open, setOpen] = useState<number | null>(null)
  const list = GALLERY.filter((g) => occ === 'all' || g.occasion === occ)
  const current = open !== null ? list[open] : null
  return (
    <div>
      <h1 className="mb-3 text-3xl font-semibold">{t('g.title')}</h1>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
        <Chip active={occ === 'all'} onClick={() => setOcc('all')}>{t('menu.all')}</Chip>
        {OCCASIONS.map((o) => <Chip key={o} active={occ === o} onClick={() => setOcc(o)}>{t(`occ.${o}` as Key)}</Chip>)}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {list.map((g, i) => (
          <button key={g.id} type="button" onClick={() => setOpen(i)} className="overflow-hidden rounded-2xl" aria-label={tl(g.caption)}>
            <Art id={g.art} className="aspect-square w-full" />
          </button>
        ))}
      </div>
      {current && (
        <Sheet title={tl(current.caption)} onClose={() => setOpen(null)}>
          <Photo src={current.art} alt={tl(current.caption)} className="aspect-square w-full overflow-hidden rounded-2xl" />
          <div className="mt-3 flex items-center gap-2">
            <button type="button" className={btn('outline')} onClick={() => setOpen((open! + list.length - 1) % list.length)} aria-label="Previous">&lsaquo;</button>
            <Link to={`/custom?photo=${encodeURIComponent(current.art)}`} className={btn('primary', 'flex-1')}>{t('g.similar')}</Link>
            <button type="button" className={btn('outline')} onClick={() => setOpen((open! + 1) % list.length)} aria-label="Next">&rsaquo;</button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

export function About() {
  const { t, tl } = useI18n()
  const { settings } = useDb()
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold">{t('ab.title')}</h1>
      <Art id="art:cupcake:0" className="aspect-video w-full rounded-3xl" />
      <p className="whitespace-pre-line">{tl(settings.about)}</p>
    </div>
  )
}

export function Contact() {
  const { t, tl } = useI18n()
  const { settings: s } = useDb()
  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-semibold">{t('ct.title')}</h1>
      <div className="flex flex-wrap gap-2">
        <a className={btn('primary')} href={waLink(s.whatsapp, '')} target="_blank" rel="noreferrer">{t('f.whatsapp')}</a>
        <a className={btn('outline')} href={`tel:${s.phone.replace(/\s/g, '')}`}>{t('f.call')}</a>
        <a className={btn('outline')} href={`mailto:${s.email}`}>{t('f.email')}</a>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t('ct.pickup')}</h2>
        <p>{s.pickupAddress}</p>
        <a className="flex min-h-11 items-center font-semibold text-rose-700" href={s.mapLink} target="_blank" rel="noreferrer">{t('b.map')}</a>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t('ct.faq')}</h2>
        <p className="whitespace-pre-line">{tl(s.faq)}</p>
      </div>
      <div>
        <h2 className="text-xl font-semibold">{t('ct.policies')}</h2>
        <p className="whitespace-pre-line">{tl(s.policies)}</p>
        <p className="mt-2 text-sm text-ink-soft">{t('f.privacy')}</p>
      </div>
    </div>
  )
}
