import type { Admin, Lang, Role } from '../domain/types'
import { buildInvitation } from './emails'
import { getDb, newId, nowMs, updateDb } from './store'

export type TeamRes = { ok: true } | { ok: false; error: string }

const activeOwners = (admins: Admin[]): Admin[] => admins.filter((a) => a.role === 'owner' && a.active && !a.invited)

export function inviteAdmin(name: string, email: string, role: Role, lang: Lang): TeamRes {
  if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email)) return { ok: false, error: 'Enter a name and a valid email.' }
  const a: Admin = {
    id: newId('adm'), name: name.trim(), email: email.trim(), role, active: true, invited: true, lang,
    alerts: { push: true, email: true }, lastSignIn: null,
  }
  const mail = buildInvitation(a, lang)
  updateDb((d) => ({
    ...d,
    admins: [...d.admins, a],
    outbox: [{ id: newId('mb'), at: nowMs(), channel: 'email', to: a.email, subject: mail.subject, body: mail.body, lang }, ...d.outbox],
  }))
  return { ok: true }
}

export function resendInvite(id: string): void {
  const a = getDb().admins.find((x) => x.id === id)
  if (!a) return
  const mail = buildInvitation(a, a.lang)
  updateDb((d) => ({
    ...d,
    outbox: [{ id: newId('mb'), at: nowMs(), channel: 'email', to: a.email, subject: mail.subject, body: mail.body, lang: a.lang }, ...d.outbox],
  }))
}

/** Demo only: pretend the invited person set their password. */
export function acceptInvite(id: string): void {
  updateDb((d) => ({ ...d, admins: d.admins.map((a) => (a.id === id ? { ...a, invited: false, lastSignIn: nowMs() } : a)) }))
}

export function setRole(id: string, role: Role): TeamRes {
  const d = getDb()
  const a = d.admins.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Not found.' }
  if (a.role === 'owner' && role === 'admin' && activeOwners(d.admins).length <= 1 && a.active) {
    return { ok: false, error: 'There must always be at least one active Owner.' }
  }
  updateDb((db) => ({ ...db, admins: db.admins.map((x) => (x.id === id ? { ...x, role } : x)) }))
  return { ok: true }
}

export function setActive(id: string, active: boolean): TeamRes {
  const d = getDb()
  const a = d.admins.find((x) => x.id === id)
  if (!a) return { ok: false, error: 'Not found.' }
  if (!active && a.role === 'owner' && !a.invited && activeOwners(d.admins).length <= 1) {
    return { ok: false, error: 'The last active Owner cannot be deactivated.' }
  }
  updateDb((db) => ({ ...db, admins: db.admins.map((x) => (x.id === id ? { ...x, active } : x)) }))
  return { ok: true }
}
