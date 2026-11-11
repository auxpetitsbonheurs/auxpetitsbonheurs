import { useState } from 'react'
import { Link } from 'react-router-dom'
import { formatRs } from '../domain/money'
import type { Role, Settings, TemplateKey } from '../domain/types'
import { acceptInvite, inviteAdmin, resendInvite, setActive, setRole } from '../mocks/teamActions'
import { sessionStore, updateDb, useDb, useSession } from '../mocks/store'
import { Badge, btn, Field, inputCls } from '../ui/ui'
import { fmtStamp } from '../domain/time'
import { OrderRow } from './common'

export function More() {
  const { isOwner } = useSession()
  const items: [string, string, boolean][] = [
    ['/admin/customers', 'Customers', true], ['/admin/promotions', 'Promotions', true], ['/admin/profile', 'My profile', true],
    ['/admin/availability', 'Availability & Settings (Owner)', isOwner], ['/admin/team', 'Team (Owner)', isOwner],
  ]
  return (
    <div className="space-y-2">
      <h1 className="mb-2 text-3xl">More</h1>
      {items.filter((i) => i[2]).map(([to, label]) => <Link key={to} to={to} className="flex min-h-14 items-center rounded-card border border-honey-200 bg-paper px-4 font-semibold">{label}</Link>)}
    </div>
  )
}

export function Customers() {
  const db = useDb()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const list = db.customers.filter((c) => !q || `${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
  const stats = (phone: string) => {
    const key = phone.replace(/\D/g, '').slice(-7)
    const os = db.orders.filter((o) => o.customer.phone.replace(/\D/g, '').slice(-7) === key)
    return { os, spent: os.filter((o) => o.status === 'completed').reduce((t, o) => t + o.total, 0) }
  }
  return (
    <div className="space-y-3">
      <h1 className="text-3xl">Customers</h1>
      <input className={inputCls} type="search" aria-label="Search customers" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
      {list.map((c) => {
        const { os, spent } = stats(c.phone)
        return (
          <div key={c.id} className="rounded-card border border-honey-200 bg-paper p-3">
            <button className="w-full text-left" onClick={() => setOpen(open === c.id ? null : c.id)}>
              <p className="font-semibold">{c.name}</p><p className="text-sm text-ink-soft">{c.phone} · {os.length} orders · {formatRs(spent)} completed</p>
            </button>
            {open === c.id && (
              <div className="mt-2 space-y-2">
                <Field label="Private note"><input className={inputCls} defaultValue={c.note ?? ''} onBlur={(e) => updateDb((d) => ({ ...d, customers: d.customers.map((x) => (x.id === c.id ? { ...x, note: e.target.value } : x)) }))} /></Field>
                {os.map((o) => <OrderRow key={o.id} o={o} settings={db.settings} />)}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function Profile() {
  const { admin } = useSession()
  if (!admin) return null
  const patch = (p: Partial<typeof admin>) => updateDb((d) => ({ ...d, admins: d.admins.map((a) => (a.id === admin.id ? { ...a, ...p } : a)) }))
  return (
    <div className="space-y-3">
      <h1 className="text-3xl">My profile</h1>
      <Field label="Name"><input className={inputCls} value={admin.name} onChange={(e) => patch({ name: e.target.value })} /></Field>
      <Field label="Language"><select className={inputCls} value={admin.lang} onChange={(e) => patch({ lang: e.target.value as 'en' | 'fr' })}><option value="en">English</option><option value="fr">Français</option></select></Field>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={admin.alerts.push} onChange={(e) => patch({ alerts: { ...admin.alerts, push: e.target.checked } })} />Push alerts</label>
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-honey-600" checked={admin.alerts.email} onChange={(e) => patch({ alerts: { ...admin.alerts, email: e.target.checked } })} />Email alerts</label>
      <p className="text-sm text-ink-soft">Password change is faked in this prototype.</p>
    </div>
  )
}

export function Team() {
  const db = useDb()
  const { admin: me } = useSession()
  const [f, setF] = useState({ name: '', email: '', role: 'admin' as Role })
  const [msg, setMsg] = useState('')
  const act = (r: { ok: boolean; error?: string }) => setMsg(r.ok ? '' : (r as { error: string }).error)
  return (
    <div className="space-y-3">
      <h1 className="text-3xl">Team</h1>
      {msg && <p role="alert" className="rounded-card bg-red-100 p-3 text-sm font-semibold text-red-800">{msg}</p>}
      {db.admins.map((a) => (
        <div key={a.id} className="rounded-card border border-honey-200 bg-paper p-3 text-sm">
          <p className="font-semibold">{a.name} {a.id === me?.id && '(you)'} <Badge tone={a.invited ? 'amber' : a.active ? 'green' : 'grey'}>{a.invited ? 'invited' : a.active ? 'active' : 'deactivated'}</Badge></p>
          <p className="text-ink-soft">{a.email} · last sign-in {a.lastSignIn ? fmtStamp(a.lastSignIn) : 'never'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <select className={`${inputCls} w-auto`} aria-label={`Role of ${a.name}`} value={a.role} onChange={(e) => act(setRole(a.id, e.target.value as Role))}><option value="owner">Owner</option><option value="admin">Admin</option></select>
            <button className={btn('outline')} onClick={() => act(setActive(a.id, !a.active))}>{a.active ? 'Deactivate' : 'Reactivate'}</button>
            {a.invited && <><button className={btn('ghost')} onClick={() => resendInvite(a.id)}>Resend invite</button><button className={btn('ghost')} onClick={() => acceptInvite(a.id)}>Demo: accept invite</button></>}
          </div>
        </div>
      ))}
      <section className="space-y-2 rounded-card border border-honey-200 p-3">
        <h2 className="text-lg">Invite</h2>
        <Field label="Name"><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email"><input className={inputCls} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Role"><select className={inputCls} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as Role })}><option value="admin">Admin</option><option value="owner">Owner</option></select></Field>
        <button className={btn('primary', 'w-full')} onClick={() => { const r = inviteAdmin(f.name, f.email, f.role, 'en'); act(r); if (r.ok) setF({ name: '', email: '', role: 'admin' }) }}>Send invitation (see Outbox)</button>
      </section>
      <p className="hidden">{String(sessionStore.get().adminId)}</p>
    </div>
  )
}

const TEMPLATE_NAMES: [TemplateKey, string][] = [['approved', 'Order approved'], ['ready', 'Ready for pickup'], ['onway', 'On the way'], ['payment', 'Payment reminder'], ['blank', 'Blank']]

export function SettingsScreen() {
  const db = useDb()
  const s = db.settings
  const set = (p: Partial<Settings>) => updateDb((d) => ({ ...d, settings: { ...d.settings, ...p } }))
  const num = (v: string) => Number(v.replace(/\D/g, ''))
  const [blk, setBlk] = useState({ from: '', to: '', reason: '' })
  return (
    <div className="space-y-4 pb-8">
      <h1 className="text-3xl">Availability & Settings</h1>
      <Field label="Default notice (days)"><input className={inputCls} inputMode="numeric" value={s.defaultNotice} onChange={(e) => set({ defaultNotice: num(e.target.value) })} /></Field>
      <div>
        <p className="mb-1 text-sm font-semibold">Weekly closed days</p>
        <div className="flex flex-wrap gap-1">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((n, i) => (
          <button key={n} aria-pressed={s.closedDays.includes(i)} className={`min-h-11 min-w-11 rounded-xl border px-3 text-sm font-semibold ${s.closedDays.includes(i) ? 'border-honey-600 bg-honey-600 text-paper' : 'border-honey-200 bg-paper'}`}
            onClick={() => set({ closedDays: s.closedDays.includes(i) ? s.closedDays.filter((x) => x !== i) : [...s.closedDays, i] })}>{n}</button>))}</div>
      </div>
      <section className="space-y-2">
        <h2 className="text-lg">Blocked dates</h2>
        {db.blocked.map((b) => <div key={b.id} className="flex items-center justify-between rounded-xl bg-paper p-2 text-sm">{b.from}{b.to !== b.from && ` to ${b.to}`} {b.reason && `(${b.reason})`}<button className="min-h-11 text-red-700" onClick={() => updateDb((d) => ({ ...d, blocked: d.blocked.filter((x) => x.id !== b.id) }))}>Remove</button></div>)}
        <div className="grid grid-cols-2 gap-2"><input className={inputCls} type="date" aria-label="From" value={blk.from} onChange={(e) => setBlk({ ...blk, from: e.target.value })} /><input className={inputCls} type="date" aria-label="To" value={blk.to} onChange={(e) => setBlk({ ...blk, to: e.target.value })} /></div>
        <input className={inputCls} placeholder="Reason (private)" value={blk.reason} onChange={(e) => setBlk({ ...blk, reason: e.target.value })} />
        <button className={btn('outline')} disabled={!blk.from} onClick={() => { updateDb((d) => ({ ...d, blocked: [...d.blocked, { id: `blk-${Date.now()}`, from: blk.from, to: blk.to || blk.from, reason: blk.reason, by: 'Owner' }] })); setBlk({ from: '', to: '', reason: '' }) }}>Block range</button>
      </section>
      <Field label="Delivery fee (Rs)"><input className={inputCls} inputMode="numeric" value={s.deliveryFee} onChange={(e) => set({ deliveryFee: num(e.target.value) })} /></Field>
      <Field label="Quote validity (days)"><input className={inputCls} inputMode="numeric" value={s.quoteValidity} onChange={(e) => set({ quoteValidity: num(e.target.value) })} /></Field>
      <Field label="Juice number"><input className={inputCls} value={s.juice} onChange={(e) => set({ juice: e.target.value })} /></Field>
      <Field label="Pickup address"><input className={inputCls} value={s.pickupAddress} onChange={(e) => set({ pickupAddress: e.target.value })} /></Field>
      <Field label="Map link"><input className={inputCls} value={s.mapLink} onChange={(e) => set({ mapLink: e.target.value })} /></Field>
      <Field label="WhatsApp / phone"><input className={inputCls} value={s.whatsapp} onChange={(e) => set({ whatsapp: e.target.value, phone: e.target.value })} /></Field>
      <section className="space-y-3">
        <h2 className="text-lg">WhatsApp templates</h2>
        <p className="text-xs text-ink-soft">Placeholders: {'{name} {order_number} {date} {window} {total} {juice_number} {pickup_address} {tracking_link}'}</p>
        {TEMPLATE_NAMES.map(([k, label]) => (['en', 'fr'] as const).map((l) => (
          <Field key={k + l} label={`${label} (${l.toUpperCase()})`}>
            <textarea className={inputCls} rows={3} value={s.templates[k][l]} onChange={(e) => set({ templates: { ...s.templates, [k]: { ...s.templates[k], [l]: e.target.value } } })} />
          </Field>
        )))}
      </section>
    </div>
  )
}
