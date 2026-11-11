import { useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { earliestDate } from '../domain/availability'
import type { Fulfilment } from '../domain/types'
import { useI18n, type Key } from '../i18n'
import { placeCustomRequest } from '../mocks/orderActions'
import { todayMU, useDb } from '../mocks/store'
import { OCCASIONS } from '../mocks/gallery'
import { Photo } from '../ui/Art'
import { btn, Field, inputCls, shrinkImage } from '../ui/ui'
import { basketStore } from './basketStore'
import { DatePicker } from './DatePicker'

const MAX_PHOTOS = 5
const MAX_BYTES = 10 * 1024 * 1024

export function CustomRequest() {
  const db = useDb()
  const { t, lang, date } = useI18n()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const key = useRef(`cr-${Math.random().toString(36).slice(2)}`)
  const prefill = basketStore.get().draft
  const initialPhoto = params.get('photo')
  const [f, setF] = useState({
    occasion: '', servings: '', flavours: '', theme: '', text: '', budget: '', details: '', address: '',
    date: '', window: '', name: prefill.name, phone: prefill.phone, email: prefill.email,
  })
  const [fulfilment, setFulfilment] = useState<Fulfilment>('pickup')
  const [photos, setPhotos] = useState<string[]>(initialPhoto ? [initialPhoto] : [])
  const [photoMsg, setPhotoMsg] = useState('')
  const [err, setErr] = useState('')
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }))

  const ctx = { today: todayMU(), noticeDays: db.settings.defaultNotice, closedDays: db.settings.closedDays, blocked: db.blocked }

  const addPhotos = async (files: FileList | null) => {
    if (!files) return
    setPhotoMsg('')
    let next = [...photos]
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) { setPhotoMsg(t('cu.maxPhotos')); break }
      if (!file.type.startsWith('image/')) { setPhotoMsg(t('cu.notImage')); continue }
      if (file.size > MAX_BYTES) { setPhotoMsg(t('cu.tooBig')); continue }
      try { next = [...next, await shrinkImage(file)] } catch { setPhotoMsg(t('cu.notImage')) }
    }
    setPhotos(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const res = placeCustomRequest({
      custom: {
        occasion: f.occasion, servings: f.servings, flavours: f.flavours, theme: f.theme, text: f.text,
        budget: f.budget ? Number(f.budget) : undefined, photos, details: f.details,
      },
      fulfilment, address: f.address, date: f.date, window: f.window || db.settings.windows[0].id,
      customer: { name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim() },
      lang, submitKey: key.current,
    })
    if (res.ok) nav(`/confirmation/${res.order.token}`)
    else setErr(res.error === 'date' ? t('err.date') : t('b.fix'))
  }

  return (
    <form onSubmit={submit} className="space-y-4 pb-8">
      <h1 className="text-3xl">{t('cu.title')}</h1>
      <p className="text-ink-soft">{t('cu.intro')}</p>
      {err && <p role="alert" className="rounded-card bg-red-100 p-3 text-sm font-semibold text-red-800">{err}</p>}

      <Field label={t('cu.occasion')}>
        <select required className={inputCls} value={f.occasion} onChange={(e) => set('occasion')(e.target.value)}>
          <option value="" />
          {[...OCCASIONS, 'other'].map((o) => <option key={o} value={o}>{t(`occ.${o}` as Key)}</option>)}
        </select>
      </Field>
      <Field label={t('cu.servings')}><input required className={inputCls} inputMode="numeric" value={f.servings} onChange={(e) => set('servings')(e.target.value)} /></Field>
      <Field label={t('cu.flavours')}><input required className={inputCls} value={f.flavours} onChange={(e) => set('flavours')(e.target.value)} /></Field>
      <Field label={t('cu.theme')}><input className={inputCls} value={f.theme} onChange={(e) => set('theme')(e.target.value)} /></Field>
      <Field label={t('cu.text')}><input className={inputCls} value={f.text} onChange={(e) => set('text')(e.target.value)} /></Field>

      <div>
        <p className="mb-1 text-sm font-semibold">{t('cu.photos')} ({photos.length}/{MAX_PHOTOS})</p>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div key={i} className="relative">
              <Photo src={p} alt={`${t('cu.photos')} ${i + 1}`} className="h-20 w-20 overflow-hidden rounded-xl" />
              <button type="button" aria-label={t('common.remove')} className="absolute -right-3 -top-3 h-11 w-11 rounded-full border-2 border-cream bg-ink text-paper" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>&times;</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-ink-line text-center text-xs font-semibold text-honey-700">
              {t('cu.addPhoto')}
              <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = '' }} />
            </label>
          )}
        </div>
        <p className="mt-1 text-xs text-ink-soft">{t('cu.photosHint')}</p>
        {photoMsg && <p role="alert" className="text-xs font-semibold text-red-700">{photoMsg}</p>}
      </div>

      <Field label={t('cu.budget')}><input className={inputCls} inputMode="numeric" value={f.budget} onChange={(e) => set('budget')(e.target.value.replace(/\D/g, ''))} /></Field>

      <div>
        <p className="mb-1 text-sm font-semibold">{t('b.how')}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['delivery', 'pickup'] as Fulfilment[]).map((x) => (
            <button key={x} type="button" aria-pressed={fulfilment === x} onClick={() => setFulfilment(x)} className={`min-h-11 rounded-card border font-semibold ${fulfilment === x ? 'border-honey-600 bg-honey-100' : 'border-honey-200 bg-paper'}`}>{t(`b.${x}`)}</button>
          ))}
        </div>
      </div>
      {fulfilment === 'delivery' && <Field label={t('b.address')}><textarea required className={inputCls} rows={2} value={f.address} onChange={(e) => set('address')(e.target.value)} /></Field>}

      <div>
        <p className="mb-1 text-sm font-semibold">{t('b.date')}</p>
        <p className="mb-2 text-sm text-ink-soft">{t('b.earliest', { date: date(earliestDate(ctx), true) })}</p>
        <DatePicker value={f.date} ctx={ctx} onChange={set('date')} />
        <p className="mt-1 text-sm font-semibold">{f.date ? t('b.selected', { date: date(f.date, true) }) : t('b.noDate')}</p>
      </div>

      <Field label={t('cu.details')}><textarea className={inputCls} rows={3} value={f.details} onChange={(e) => set('details')(e.target.value)} /></Field>
      <Field label={t('b.name')}><input required className={inputCls} value={f.name} onChange={(e) => set('name')(e.target.value)} /></Field>
      <Field label={t('b.phone')}><input required className={inputCls} type="tel" inputMode="tel" value={f.phone} onChange={(e) => set('phone')(e.target.value)} /></Field>
      <Field label={t('b.email')}><input required className={inputCls} type="email" inputMode="email" value={f.email} onChange={(e) => set('email')(e.target.value)} /></Field>
      <button type="submit" className={btn('primary', 'w-full')} disabled={!f.date}>{t('cu.send')}</button>
    </form>
  )
}
