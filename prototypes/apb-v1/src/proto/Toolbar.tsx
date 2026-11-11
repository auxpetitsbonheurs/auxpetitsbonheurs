import { useEffect, useRef, useState } from 'react'
import { fmtStamp } from '../domain/time'
import { sweepExpiredQuotes } from '../mocks/orderActions'
import { advanceClock, nowMs, resetDb, sessionStore, useDb, useNow, useSession } from '../mocks/store'
import { basketStore } from '../customer/basketStore'

interface Toast { id: string; text: string }

export function Toolbar() {
  const db = useDb()
  const now = useNow()
  const { admin } = useSession()
  const [open, setOpen] = useState(false)
  const [showBox, setShowBox] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const seen = useRef<string | null>(db.outbox[0]?.id ?? null)

  useEffect(() => { sweepExpiredQuotes() }, [now, db.clockMs])

  // Push alerts show as toasts for the signed-in admin.
  useEffect(() => {
    const idx = db.outbox.findIndex((m) => m.id === seen.current)
    const fresh = idx === -1 ? db.outbox : db.outbox.slice(0, idx)
    seen.current = db.outbox[0]?.id ?? null
    const mine = fresh.filter((m) => m.channel === 'push' && admin && m.to === admin.name)
    if (!mine.length) return
    const add = mine.map((m) => ({ id: m.id, text: `${m.subject}: ${m.body}` }))
    setToasts((t) => [...add, ...t].slice(0, 3))
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => !add.some((a) => a.id === x.id))), 5000)
    return () => clearTimeout(timer)
  }, [db.outbox, admin])

  const role = admin ? admin.id : 'customer'
  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 top-14 z-[70] flex flex-col items-center gap-1 px-3">
        {toasts.map((t) => <div key={t.id} role="status" className="pointer-events-auto w-full max-w-sm rounded-xl bg-ink px-3 py-2 text-sm text-paper shadow-soft">Push: {t.text}</div>)}
      </div>
      <div className="fixed bottom-24 right-2 z-[65] max-w-[calc(100vw-1rem)] text-xs">
        {open ? (
          <div className="w-72 max-w-full space-y-2 rounded-card border border-amber-300 bg-amber-50 p-3 shadow-soft">
            <div className="flex items-center justify-between"><strong>Prototype - fake data</strong><button className="min-h-11 min-w-11 text-lg" aria-label="Collapse toolbar" onClick={() => setOpen(false)}>&times;</button></div>
            <label className="block font-semibold">Role (replaces login)
              <select className="mt-1 min-h-11 w-full rounded-lg border border-amber-300 bg-paper px-2 text-sm" value={role} onChange={(e) => sessionStore.set({ adminId: e.target.value === 'customer' ? null : e.target.value })}>
                <option value="customer">Customer</option>
                {db.admins.filter((a) => !a.invited).map((a) => <option key={a.id} value={a.id}>{a.role === 'owner' ? 'Owner' : 'Admin'} {a.name}{a.active ? '' : ' (deactivated)'}</option>)}
              </select>
            </label>
            <p>Fake clock: {fmtStamp(nowMs())} (+{Math.round(db.clockMs / 86400000)}d)</p>
            <div className="flex gap-1">
              <button className="min-h-11 flex-1 rounded-lg bg-paper font-semibold" onClick={() => advanceClock(86400000)}>Clock +1 day</button>
              <button className="min-h-11 flex-1 rounded-lg bg-paper font-semibold" onClick={() => advanceClock(-db.clockMs)}>Clock reset</button>
            </div>
            <div className="flex gap-1">
              <button className="min-h-11 flex-1 rounded-lg bg-paper font-semibold" onClick={() => setShowBox(true)}>Outbox ({db.outbox.length})</button>
              <button className="min-h-11 flex-1 rounded-lg bg-red-100 font-semibold text-red-800" onClick={() => { if (window.confirm('Reset all prototype data?')) { resetDb(); basketStore.reset(); sessionStore.set({ adminId: null }) } }}>Reset data</button>
            </div>
          </div>
        ) : (
          <button className="min-h-11 rounded-full border border-amber-300 bg-amber-50 px-3 font-semibold shadow-soft" onClick={() => setOpen(true)}>Prototype - fake data</button>
        )}
      </div>
      {showBox && <Outbox onClose={() => setShowBox(false)} />}
    </>
  )
}

function Outbox({ onClose }: { onClose: () => void }) {
  const db = useDb()
  const [open, setOpen] = useState<string | null>(null)
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-label="Outbox">
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-paper p-4 text-sm sm:rounded-band">
        <div className="mb-2 flex items-center justify-between"><h2 className="text-lg">Fake outbox ({db.outbox.length})</h2><button className="min-h-11 min-w-11 text-2xl" aria-label="Close outbox" onClick={onClose}>&times;</button></div>
        {db.outbox.length === 0 && <p>Nothing sent yet. Emails and push alerts the real app would send appear here.</p>}
        {db.outbox.map((m) => (
          <div key={m.id} className="border-b border-stone-200 py-2">
            <button className="w-full text-left" onClick={() => setOpen(open === m.id ? null : m.id)}>
              <p className="font-semibold">{m.channel === 'push' ? 'PUSH' : 'EMAIL'} [{m.lang.toUpperCase()}] to {m.to}</p>
              <p>{m.subject}</p><p className="text-xs text-stone-500">{fmtStamp(m.at)}</p>
            </button>
            {open === m.id && <pre className="mt-1 whitespace-pre-wrap rounded-lg bg-stone-100 p-2 font-sans text-xs">{m.body}</pre>}
          </div>
        ))}
      </div>
    </div>
  )
}
