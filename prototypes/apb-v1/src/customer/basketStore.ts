import { createLocalStore } from '../mocks/localStore'
import type { Fulfilment, Selection } from '../domain/types'

export interface BasketLine { id: string; productId: string; selection: Selection; seen: number }
export interface Draft {
  fulfilment: Fulfilment | ''
  address: string
  landmark: string
  date: string
  window: string
  name: string
  phone: string
  email: string
  note: string
  policies: boolean
}
export interface BasketState { lines: BasketLine[]; draft: Draft; submitKey: string }

export const emptyDraft = (): Draft => ({
  fulfilment: '', address: '', landmark: '', date: '', window: '', name: '', phone: '', email: '', note: '', policies: false,
})
const fresh = (): BasketState => ({ lines: [], draft: emptyDraft(), submitKey: `k-${Math.random().toString(36).slice(2)}` })

export const basketStore = createLocalStore<BasketState>('apb-v1-basket', fresh)
export const useBasket = (): BasketState => basketStore.use()

export const addLine = (line: BasketLine): void =>
  basketStore.update((b) => ({ ...b, lines: [...b.lines, line] }))
export const replaceLine = (line: BasketLine): void =>
  basketStore.update((b) => ({ ...b, lines: b.lines.map((l) => (l.id === line.id ? line : l)) }))
export const removeLine = (id: string): void =>
  basketStore.update((b) => ({ ...b, lines: b.lines.filter((l) => l.id !== id) }))
export const patchLine = (id: string, patch: Partial<BasketLine>): void =>
  basketStore.update((b) => ({ ...b, lines: b.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) }))
export const patchDraft = (patch: Partial<Draft>): void =>
  basketStore.update((b) => ({ ...b, draft: { ...b.draft, ...patch } }))
/** After a successful send: empty the basket but keep the customer's contact details. */
export const clearBasket = (): void =>
  basketStore.update((b) => ({
    ...fresh(),
    draft: { ...emptyDraft(), name: b.draft.name, phone: b.draft.phone, email: b.draft.email },
  }))
export const newLineId = (): string => `l-${Math.random().toString(36).slice(2, 8)}`
