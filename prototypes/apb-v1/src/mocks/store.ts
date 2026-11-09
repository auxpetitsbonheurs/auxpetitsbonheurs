import { createLocalStore } from './localStore'
import { seedDb } from './seed'
import type { Db, Lang } from '../domain/types'
import { ymdOf } from '../domain/time'

/** Bump when the seed shape changes so old localStorage is ignored. */
const DB_KEY = 'apb-v1-db-1'

export const dbStore = createLocalStore<Db>(DB_KEY, () => seedDb(Date.now()))
export const getDb = (): Db => dbStore.get()
export const useDb = (): Db => dbStore.use()
export const updateDb = (fn: (d: Db) => Db): void => dbStore.update(fn)
export const resetDb = (): void => dbStore.set(seedDb(Date.now()))

/** "Now" in the prototype = real time + the toolbar's fake clock offset. */
export const nowMs = (): number => Date.now() + getDb().clockMs
export const useNow = (): number => {
  const db = useDb()
  return Date.now() + db.clockMs
}
export const todayMU = (): string => ymdOf(nowMs())
export const advanceClock = (ms: number): void => updateDb((d) => ({ ...d, clockMs: d.clockMs + ms }))

/** Session: who the toolbar says we are (replaces login). null = customer. */
export const sessionStore = createLocalStore<{ adminId: string | null }>('apb-v1-session', () => ({ adminId: null }))
export const useSession = () => {
  const s = sessionStore.use()
  const db = useDb()
  const admin = s.adminId ? db.admins.find((a) => a.id === s.adminId) : undefined
  return {
    admin,
    isAdmin: !!admin && admin.active && !admin.invited,
    isOwner: !!admin && admin.active && admin.role === 'owner',
    deactivated: !!admin && !admin.active,
  }
}

function initialLang(): Lang {
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}
export const langStore = createLocalStore<Lang>('apb-v1-lang', initialLang)

export const newId = (prefix: string): string => `${prefix}-${Math.random().toString(36).slice(2, 9)}`
export function newToken(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 28)
}
