import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { formatRs } from '../domain/money'
import type { Allergen, L, OptionGroup, OptionKind, Product, ProductStatus, ProductType } from '../domain/types'
import { newId, updateDb, useDb } from '../mocks/store'
import { ART_CHOICES, Photo } from '../ui/Art'
import { Badge, btn, Field, inputCls, Chip } from '../ui/ui'

const TYPES: ProductType[] = ['cake', 'cupcake', 'dessert', 'seasonal']
const ALLERGENS: Allergen[] = ['gluten', 'egg', 'milk', 'nuts', 'soy']

export function AdminMenu() {
  const db = useDb()
  const nav = useNavigate()
  const setStatus = (id: string, status: ProductStatus) => updateDb((d) => ({ ...d, products: d.products.map((p) => (p.id === id ? { ...p, status } : p)) }))
  const move = (id: string, dir: -1 | 1) => updateDb((d) => {
    const sorted = [...d.products].sort((a, b) => a.sort - b.sort)
    const i = sorted.findIndex((p) => p.id === id), j = i + dir
    if (j < 0 || j >= sorted.length) return d
    ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    return { ...d, products: sorted.map((p, k) => ({ ...p, sort: k + 1 })) }
  })
  const duplicate = (p: Product) => {
    const copy: Product = { ...p, id: newId('p'), name: { en: `${p.name.en} (copy)`, fr: `${p.name.fr} (copie)` }, status: 'hidden', sort: db.products.length + 1 }
    updateDb((d) => ({ ...d, products: [...d.products, copy] }))
    nav(`/admin/menu/${copy.id}`)
  }
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl">Menu</h1>
        <Link to="/admin/menu/new" className={btn()}>+ New product</Link>
      </div>
      <Link to="/admin/promotions" className={btn('outline', 'w-full')}>Promotions</Link>
      {[...db.products].sort((a, b) => a.sort - b.sort).map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-card border border-honey-200 bg-paper p-3">
          <Photo src={p.photos[0] ?? 'art:cake:0'} alt={p.name.en} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl" />
          <div className="min-w-0 flex-1">
            <Link to={`/admin/menu/${p.id}`} className="block truncate font-semibold">{p.name.en}</Link>
            <p className="text-xs text-ink-soft">{p.type} · {formatRs(p.basePrice)} <Badge tone={p.status === 'available' ? 'green' : p.status === 'soldout' ? 'amber' : 'grey'}>{p.status}</Badge></p>
            <div className="flex flex-wrap gap-1 text-xs font-semibold text-honey-700">
              <button className="min-h-11 px-1" onClick={() => setStatus(p.id, p.status === 'soldout' ? 'available' : 'soldout')}>{p.status === 'soldout' ? 'Back in stock' : 'Sold out'}</button>
              <button className="min-h-11 px-1" onClick={() => setStatus(p.id, p.status === 'hidden' ? 'available' : 'hidden')}>{p.status === 'hidden' ? 'Show' : 'Hide'}</button>
              <button className="min-h-11 px-1" onClick={() => duplicate(p)}>Duplicate</button>
            </div>
          </div>
          <div className="flex flex-col">
            <button className="min-h-11 min-w-11" aria-label="Move up" onClick={() => move(p.id, -1)}>&uarr;</button>
            <button className="min-h-11 min-w-11" aria-label="Move down" onClick={() => move(p.id, 1)}>&darr;</button>
          </div>
        </div>
      ))}
    </div>
  )
}

const blank = (sort: number): Product => ({
  id: newId('p'), type: 'cake', name: { en: '', fr: '' }, desc: { en: '', fr: '' }, photos: ['art:cake:0'], basePrice: 0, allergens: [],
  status: 'available', sort, groups: [],
})
const group = (kind: OptionKind, en: string, fr: string, required: boolean): OptionGroup => ({
  id: newId('g'), name: { en, fr }, kind, required, choices: [], ...(kind === 'text' ? { charLimit: 40 } : {}), ...(kind === 'quantity' ? { qtyMin: 1, qtyMax: 20 } : {}),
})

export function ProductEditor() {
  const { id } = useParams()
  const db = useDb()
  const nav = useNavigate()
  const existing = db.products.find((p) => p.id === id)
  const [p, setP] = useState<Product>(() => existing ?? blank(db.products.length + 1))
  const [saved, setSaved] = useState(false)
  const up = (patch: Partial<Product>) => { setP({ ...p, ...patch }); setSaved(false) }
  const upGroup = (gid: string, patch: Partial<OptionGroup>) => up({ groups: p.groups.map((g) => (g.id === gid ? { ...g, ...patch } : g)) })
  const tl2 = (label: string, key: 'name' | 'desc', multiline = false) => (['en', 'fr'] as const).map((l) => (
    <Field key={l + key} label={`${label} (${l.toUpperCase()})`}>
      {multiline ? <textarea className={inputCls} rows={2} value={p[key][l]} onChange={(e) => up({ [key]: { ...p[key], [l]: e.target.value } as L })} />
        : <input className={inputCls} value={p[key][l]} onChange={(e) => up({ [key]: { ...p[key], [l]: e.target.value } as L })} />}
    </Field>
  ))
  const save = () => {
    if (!p.name.en.trim()) return
    const fixed = { ...p, name: { ...p.name, fr: p.name.fr || p.name.en }, desc: { ...p.desc, fr: p.desc.fr || p.desc.en } }
    updateDb((d) => ({ ...d, products: existing ? d.products.map((x) => (x.id === p.id ? fixed : x)) : [...d.products, fixed] }))
    setSaved(true)
    if (!existing) nav('/admin/menu')
  }
  return (
    <div className="space-y-4 pb-8">
      <Link to="/admin/menu" className="inline-flex min-h-11 items-center text-sm font-semibold text-honey-700">&lsaquo; Menu</Link>
      <h1 className="text-3xl">{existing ? 'Edit product' : 'New product'}</h1>
      <div className="flex flex-wrap gap-2">{TYPES.map((t) => <Chip key={t} active={p.type === t} onClick={() => up({ type: t })}>{t}</Chip>)}</div>
      {tl2('Name', 'name')}
      {tl2('Description', 'desc', true)}
      <Field label="Base price (Rs)"><input className={inputCls} inputMode="numeric" value={p.basePrice || ''} onChange={(e) => up({ basePrice: Number(e.target.value.replace(/\D/g, '')) })} /></Field>
      <Field label="Notice days (blank = default)"><input className={inputCls} inputMode="numeric" value={p.noticeDays ?? ''} onChange={(e) => up({ noticeDays: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : undefined })} /></Field>
      <Field label="Status"><select className={inputCls} value={p.status} onChange={(e) => up({ status: e.target.value as ProductStatus })}><option value="available">Available</option><option value="soldout">Sold out</option><option value="hidden">Hidden</option></select></Field>
      {p.type === 'seasonal' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Season start"><input className={inputCls} type="date" value={p.seasonStart ?? ''} onChange={(e) => up({ seasonStart: e.target.value || undefined })} /></Field>
          <Field label="Season end"><input className={inputCls} type="date" value={p.seasonEnd ?? ''} onChange={(e) => up({ seasonEnd: e.target.value || undefined })} /></Field>
        </div>
      )}
      <div>
        <p className="mb-1 text-sm font-semibold">Allergens</p>
        <div className="flex flex-wrap gap-2">{ALLERGENS.map((a) => <Chip key={a} active={p.allergens.includes(a)} onClick={() => up({ allergens: p.allergens.includes(a) ? p.allergens.filter((x) => x !== a) : [...p.allergens, a] })}>{a}</Chip>)}</div>
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold">Photos (illustrations in the prototype; the real app uploads from the camera roll)</p>
        <div className="flex flex-wrap gap-2">{p.photos.map((ph, i) => (
          <div key={i} className="relative"><Photo src={ph} alt={`Photo ${i + 1}`} className="h-16 w-16 overflow-hidden rounded-xl" />
            <button className="absolute -right-3 -top-3 h-11 w-11 rounded-full border-2 border-cream bg-ink text-paper" aria-label="Remove photo" onClick={() => up({ photos: p.photos.filter((_, j) => j !== i) })}>&times;</button></div>
        ))}</div>
        <select className={`${inputCls} mt-2`} aria-label="Add photo" value="" onChange={(e) => e.target.value && p.photos.length < 5 && up({ photos: [...p.photos, e.target.value] })}>
          <option value="">+ Add photo...</option>{ART_CHOICES.map((a) => <option key={a} value={a}>{a.replace('art:', '')}</option>)}
        </select>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl">Options</h2>
        <div className="flex flex-wrap gap-2">
          <button className={btn('outline')} onClick={() => up({ groups: [...p.groups, group('one', 'Size', 'Taille', true)] })}>+ Size</button>
          <button className={btn('outline')} onClick={() => up({ groups: [...p.groups, group('one', 'Flavour', 'Parfum', true)] })}>+ Flavour</button>
          <button className={btn('outline')} onClick={() => up({ groups: [...p.groups, group('several', 'Add-ons', 'Suppléments', false)] })}>+ Add-ons</button>
          <button className={btn('outline')} onClick={() => up({ groups: [...p.groups, group('text', 'Message on cake', 'Message sur le gâteau', false)] })}>+ Message</button>
          <button className={btn('outline')} onClick={() => up({ groups: [...p.groups, group('quantity', 'Quantity', 'Quantité', true)] })}>+ Quantity</button>
        </div>
        {p.groups.map((g) => (
          <div key={g.id} className="space-y-2 rounded-card border border-honey-200 bg-paper p-3">
            <div className="grid grid-cols-2 gap-2">
              <input className={inputCls} aria-label="Group name EN" value={g.name.en} onChange={(e) => upGroup(g.id, { name: { ...g.name, en: e.target.value } })} />
              <input className={inputCls} aria-label="Group name FR" value={g.name.fr} onChange={(e) => upGroup(g.id, { name: { ...g.name, fr: e.target.value } })} />
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <select className={`${inputCls} w-auto`} aria-label="Kind" value={g.kind} onChange={(e) => upGroup(g.id, { kind: e.target.value as OptionKind })}>
                <option value="one">Pick one</option><option value="several">Pick several</option><option value="text">Text</option><option value="quantity">Quantity</option>
              </select>
              <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={g.required} onChange={(e) => upGroup(g.id, { required: e.target.checked })} />Required</label>
              <button className="min-h-11 font-semibold text-red-700" onClick={() => up({ groups: p.groups.filter((x) => x.id !== g.id) })}>Delete group</button>
            </div>
            {g.kind === 'text' && <Field label="Character limit"><input className={inputCls} inputMode="numeric" value={g.charLimit ?? ''} onChange={(e) => upGroup(g.id, { charLimit: Number(e.target.value.replace(/\D/g, '')) || undefined })} /></Field>}
            {g.kind === 'quantity' && (
              <div className="grid grid-cols-2 gap-2">
                <Field label="Min"><input className={inputCls} inputMode="numeric" value={g.qtyMin ?? ''} onChange={(e) => upGroup(g.id, { qtyMin: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
                <Field label="Max"><input className={inputCls} inputMode="numeric" value={g.qtyMax ?? ''} onChange={(e) => upGroup(g.id, { qtyMax: Number(e.target.value.replace(/\D/g, '')) || 1 })} /></Field>
              </div>
            )}
            {(g.kind === 'one' || g.kind === 'several') && (
              <>
                {g.choices.map((c) => (
                  <div key={c.id} className="grid grid-cols-[1fr_1fr_4.5rem_2.75rem] gap-1">
                    <input className={inputCls} aria-label="Choice EN" placeholder="EN" value={c.name.en} onChange={(e) => upGroup(g.id, { choices: g.choices.map((x) => (x.id === c.id ? { ...x, name: { ...x.name, en: e.target.value } } : x)) })} />
                    <input className={inputCls} aria-label="Choice FR" placeholder="FR" value={c.name.fr} onChange={(e) => upGroup(g.id, { choices: g.choices.map((x) => (x.id === c.id ? { ...x, name: { ...x.name, fr: e.target.value } } : x)) })} />
                    <input className={inputCls} aria-label="Price change" placeholder="+Rs" inputMode="numeric" value={c.price || ''} onChange={(e) => upGroup(g.id, { choices: g.choices.map((x) => (x.id === c.id ? { ...x, price: Number(e.target.value.replace(/\D/g, '')) } : x)) })} />
                    <button aria-label="Remove choice" className="min-h-11 text-red-700" onClick={() => upGroup(g.id, { choices: g.choices.filter((x) => x.id !== c.id) })}>&times;</button>
                  </div>
                ))}
                <button className={btn('ghost')} onClick={() => upGroup(g.id, { choices: [...g.choices, { id: newId('c'), name: { en: '', fr: '' }, price: 0 }] })}>+ Add choice</button>
              </>
            )}
          </div>
        ))}
      </section>
      <div className="sticky bottom-20 flex gap-2">
        <button className={btn('primary', 'flex-1')} onClick={save} disabled={!p.name.en.trim()}>{saved ? 'Saved' : 'Save product'}</button>
        <Link to={`/product/${p.id}`} className={btn('outline', 'bg-paper')} target="_blank">Preview</Link>
      </div>
    </div>
  )
}
