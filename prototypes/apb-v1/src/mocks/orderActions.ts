/**
 * The fake "server". Every rule that must be enforced (not just displayed) lives here,
 * reading and writing the localStorage database. Prices are always recomputed here.
 */
import type {
  Actor, Customer, Db, Fulfilment, Lang, Order, OrderCustomer, OrderItem, OutboxItem, Selection, Status,
} from '../domain/types'
import { dateProblem, noticeFor } from '../domain/availability'
import { orderTotal, isOrderable, priceLine, selectionProblems } from '../domain/pricing'
import { allowedMoves, canTransition, emailForMove, prevStatus, type EmailKind } from '../domain/status'
import { quoteExpired } from '../domain/quote'
import { formatRs } from '../domain/money'
import { addDays, ymdOf } from '../domain/time'
import { en } from '../i18n/en'
import { buildEmail } from './emails'
import { getDb, newId, newToken, nowMs, updateDb } from './store'

export type Res = { ok: true; order: Order } | { ok: false; error: string }
const fail = (error: string): Res => ({ ok: false, error })
export const SYSTEM: Actor = { kind: 'system', name: 'System' }

const statusEn = (s: Status): string => en[`st.${s}` as keyof typeof en] as string

/* ---------- outbox / alerts ---------- */

function addMail(d: Db, item: Omit<OutboxItem, 'id' | 'at'>): Db {
  return { ...d, outbox: [{ ...item, id: newId('mb'), at: nowMs() }, ...d.outbox].slice(0, 200) }
}

function emailCustomer(d: Db, o: Order, kind: EmailKind): Db {
  if (!o.customer.email) return d
  const m = buildEmail(kind, o, d.settings, o.lang)
  return addMail(d, { channel: 'email', to: o.customer.email, subject: m.subject, body: m.body, lang: o.lang, orderId: o.id })
}

/** Push (and optionally email) to every active admin who switched alerts on. */
function alertAdmins(d: Db, subject: string, body: string, orderId: string | undefined, withEmail: boolean): Db {
  let next = d
  for (const a of d.admins.filter((x) => x.active && !x.invited)) {
    if (a.alerts.push) next = addMail(next, { channel: 'push', to: a.name, subject, body, lang: 'en', orderId })
    if (withEmail && a.alerts.email) next = addMail(next, { channel: 'email', to: a.email, subject, body, lang: a.lang, orderId })
  }
  return next
}

const withEvent = (o: Order, by: Actor, what: string, details?: string): Order => ({
  ...o, events: [...o.events, { at: nowMs(), by, what, details }],
})

/* ---------- generic order mutation with the "order changed" check ---------- */

function mutate(id: string, expect: number | undefined, fn: (o: Order, d: Db) => Order | string): Res {
  const d = getDb()
  const o = d.orders.find((x) => x.id === id)
  if (!o) return fail('not_found')
  if (expect !== undefined && o.version !== expect) return fail('conflict')
  const r = fn(o, d)
  if (typeof r === 'string') return fail(r)
  const next = { ...r, version: o.version + 1 }
  updateDb((db) => ({ ...db, orders: db.orders.map((x) => (x.id === id ? next : x)) }))
  return { ok: true, order: next }
}

export interface MoveOpts { expect?: number; reason?: string }

export function moveOrder(id: string, to: Status, actor: Actor, opts: MoveOpts = {}): Res {
  const before = getDb().orders.find((o) => o.id === id)
  const res = mutate(id, opts.expect, (o) => {
    if (!canTransition(o, to, actor.kind)) return 'not_allowed'
    if (actor.kind === 'customer' && o.status === 'quote_sent' && to === 'approved' && o.quote
      && quoteExpired(o.quote, ymdOf(nowMs()))) return 'quote_expired'
    let next: Order = { ...o, status: to }
    if (to === 'declined') next = { ...next, declineReason: opts.reason?.trim() || undefined }
    if (to === 'approved' && o.quote) next = { ...next, total: o.quote.amount }
    const what = to === 'approved' ? 'approved' : to === 'declined' ? 'declined' : to === 'cancelled' ? 'cancelled' : `status: ${statusEn(to)}`
    return withEvent(next, actor, what, to === 'declined' ? opts.reason : undefined)
  })
  if (res.ok && before) {
    const kind = emailForMove(before.status, to, before.source)
    updateDb((d) => {
      let next = kind ? emailCustomer(d, res.order, kind) : d
      if (actor.kind === 'customer' && to === 'cancelled') next = alertAdmins(next, `Customer cancelled ${res.order.number}`, res.order.customer.name, res.order.id, true)
      if (actor.kind === 'customer' && to === 'approved') next = alertAdmins(next, `Quote accepted ${res.order.number}`, `${res.order.customer.name}: ${formatRs(res.order.total)}`, res.order.id, true)
      if (actor.kind === 'customer' && to === 'closed') next = alertAdmins(next, `Quote declined ${res.order.number}`, res.order.customer.name, res.order.id, true)
      return next
    })
  }
  return res
}

export function stepBack(id: string, actor: Actor, expect?: number): Res {
  return mutate(id, expect, (o) => {
    const to = prevStatus(o)
    if (!to) return 'not_allowed'
    return withEvent({ ...o, status: to }, actor, `moved back to ${statusEn(to)}`)
  })
}

export function setPaid(id: string, paid: boolean, actor: Actor, expect?: number): Res {
  return mutate(id, expect, (o) => withEvent({ ...o, paid }, actor, paid ? 'marked paid' : 'marked unpaid'))
}

export interface QuoteInput { amount: number; note: string; expiry: string }
export function sendQuote(id: string, q: QuoteInput, actor: Actor, expect?: number): Res {
  const res = mutate(id, expect, (o) => {
    if (!allowedMoves(o, 'admin').includes('quote_sent')) return 'not_allowed'
    if (!(q.amount > 0)) return 'bad_amount'
    const quote = { ...q, sentAt: nowMs() }
    return withEvent({ ...o, status: 'quote_sent', quote, total: q.amount }, actor, o.status === 'quote_sent' ? 'quote re-sent' : 'quote sent', formatRs(q.amount))
  })
  if (res.ok) updateDb((d) => emailCustomer(d, res.order, 'quote'))
  return res
}

export interface EditPatch {
  date: string
  window: string
  fulfilment: Fulfilment
  address: string
  landmark: string
  customer: OrderCustomer
  deliveryFee: number
  customerNote: string
  adminNote: string
  totalOverride?: number
}
export function editOrder(id: string, p: EditPatch, actor: Actor, expect?: number): Res {
  return mutate(id, expect, (o) => {
    if (o.status === 'completed') return 'not_allowed'
    const fee = p.fulfilment === 'delivery' ? p.deliveryFee : 0
    const total = p.totalOverride ?? (o.items.length ? orderTotal(o.items, fee, p.fulfilment === 'delivery') : o.total)
    const changed = (['date', 'window', 'fulfilment', 'address', 'landmark', 'customerNote', 'adminNote'] as const)
      .filter((k) => o[k] !== p[k])
    if (o.customer.name !== p.customer.name || o.customer.phone !== p.customer.phone || o.customer.email !== p.customer.email) changed.push('customerNote')
    if (o.total !== total) changed.push('adminNote')
    return withEvent({ ...o, ...p, deliveryFee: fee, total }, actor, 'edited', `${changed.length} field(s) changed, total ${formatRs(total)}`)
  })
}

export function setAdminNote(id: string, note: string): Res {
  return mutate(id, undefined, (o) => ({ ...o, adminNote: note }))
}

/* ---------- customers ---------- */

const digits = (s: string): string => s.replace(/\D/g, '')

export function findCustomer(d: Db, phone: string, email: string): Customer | undefined {
  const p = digits(phone)
  const e = email.trim().toLowerCase()
  return d.customers.find((c) => (p.length >= 6 && digits(c.phone).endsWith(p.slice(-7))) || (e && c.email.toLowerCase() === e))
}
function upsertCustomer(d: Db, c: OrderCustomer, lang: Lang): Db {
  const found = findCustomer(d, c.phone, c.email)
  if (found) return { ...d, customers: d.customers.map((x) => (x.id === found.id ? { ...x, ...c, lang } : x)) }
  return { ...d, customers: [...d.customers, { id: newId('c'), ...c, lang }] }
}

/* ---------- creating orders ---------- */

export interface LineInput { lineId: string; productId: string; selection: Selection; seen: number }
export interface PlaceInput {
  lines: LineInput[]
  fulfilment: Fulfilment
  address: string
  landmark: string
  date: string
  window: string
  customer: OrderCustomer
  note: string
  lang: Lang
  submitKey: string
}
export type PlaceResult =
  | { ok: true; order: Order }
  | { ok: false; error: 'empty' | 'unavailable' | 'date' | 'changed' | 'invalid' | 'missing'; lineIds?: string[]; prices?: Record<string, number> }

function createOrder(d: Db, base: Omit<Order, 'id' | 'number' | 'token' | 'createdAt' | 'version' | 'events'>, by: Actor, what: string): { db: Db; order: Order } {
  const seq = d.orderSeq
  const order: Order = {
    ...base, id: `o-${seq}`, number: `${d.settings.prefix}${String(seq).padStart(4, '0')}`,
    token: newToken(), createdAt: nowMs(), version: 1, events: [{ at: nowMs(), by, what }],
  }
  return { db: { ...d, orders: [...d.orders, order], orderSeq: seq + 1 }, order }
}

export function placeOrder(input: PlaceInput): PlaceResult {
  const d = getDb()
  const dup = d.orders.find((o) => o.submitKey === input.submitKey)
  if (dup) return { ok: true, order: dup }
  if (!input.lines.length) return { ok: false, error: 'empty' }
  const now = nowMs()
  const items: OrderItem[] = []
  const unavailable: string[] = []
  const changed: Record<string, number> = {}
  for (const l of input.lines) {
    const p = d.products.find((x) => x.id === l.productId)
    if (!p || !isOrderable(p, now)) { unavailable.push(l.lineId); continue }
    if (selectionProblems(p, l.selection).length) return { ok: false, error: 'invalid', lineIds: [l.lineId] }
    const priced = priceLine(p, l.selection, d.promotions, now)
    if (priced.unit !== l.seen) changed[l.lineId] = priced.unit
    items.push({ id: `${l.lineId}`, ...priced })
  }
  if (unavailable.length) return { ok: false, error: 'unavailable', lineIds: unavailable }
  if (Object.keys(changed).length) return { ok: false, error: 'changed', lineIds: Object.keys(changed), prices: changed }
  const notice = noticeFor(input.lines.map((l) => d.products.find((p) => p.id === l.productId)!), d.settings.defaultNotice)
  if (dateProblem(input.date, { today: ymdOf(now), noticeDays: notice, closedDays: d.settings.closedDays, blocked: d.blocked })) return { ok: false, error: 'date' }
  const delivery = input.fulfilment === 'delivery'
  if (!d.settings.windows.some((w) => w.id === input.window) || !input.customer.name.trim() || !input.customer.phone.trim()
    || (delivery && !input.address.trim())) return { ok: false, error: 'missing' }
  const fee = delivery ? d.settings.deliveryFee : 0
  const { db, order } = createOrder(d, {
    source: 'website', status: 'pending', customer: input.customer, fulfilment: input.fulfilment,
    address: delivery ? input.address : '', landmark: delivery ? input.landmark : '', date: input.date, window: input.window,
    items: items.map((it, i) => ({ ...it, id: `n-${i}` })), deliveryFee: fee, total: orderTotal(items, fee, delivery),
    paid: false, customerNote: input.note, adminNote: '', lang: input.lang, submitKey: input.submitKey,
  }, { kind: 'customer', name: input.customer.name }, 'placed')
  let next = upsertCustomer(db, input.customer, input.lang)
  next = emailCustomer(next, order, 'received')
  next = alertAdmins(next, `New order ${order.number}`, `${input.customer.name}, ${formatRs(order.total)}, ${order.date}`, order.id, true)
  updateDb(() => next)
  return { ok: true, order }
}

export interface CustomInput {
  custom: NonNullable<Order['custom']>
  fulfilment: Fulfilment
  address: string
  date: string
  window: string
  customer: OrderCustomer
  lang: Lang
  submitKey: string
}
export type CustomResult = { ok: true; order: Order } | { ok: false; error: 'date' | 'missing' }

export function placeCustomRequest(input: CustomInput): CustomResult {
  const d = getDb()
  const dup = d.orders.find((o) => o.submitKey === input.submitKey)
  if (dup) return { ok: true, order: dup }
  const ctx = { today: ymdOf(nowMs()), noticeDays: d.settings.defaultNotice, closedDays: d.settings.closedDays, blocked: d.blocked }
  if (dateProblem(input.date, ctx)) return { ok: false, error: 'date' }
  if (!input.customer.name.trim() || !input.customer.phone.trim() || !input.custom.occasion) return { ok: false, error: 'missing' }
  const { db, order } = createOrder(d, {
    source: 'custom', status: 'quote_needed', customer: input.customer, fulfilment: input.fulfilment,
    address: input.address, landmark: '', date: input.date, window: input.window, items: [], deliveryFee: 0, total: 0,
    paid: false, customerNote: '', adminNote: '', lang: input.lang, custom: input.custom, submitKey: input.submitKey,
  }, { kind: 'customer', name: input.customer.name }, 'request sent')
  let next = upsertCustomer(db, input.customer, input.lang)
  next = emailCustomer(next, order, 'request_received')
  next = alertAdmins(next, `New custom request ${order.number}`, `${input.customer.name}, ${input.custom.occasion}, ${order.date}`, order.id, true)
  updateDb(() => next)
  return { ok: true, order }
}

export interface ManualInput {
  items: Omit<OrderItem, 'id'>[]
  customer: OrderCustomer
  fulfilment: Fulfilment
  address: string
  landmark: string
  date: string
  window: string
  deliveryFee: number
  paid: boolean
  adminNote: string
}
export function placeManualOrder(input: ManualInput, actor: Actor): Res {
  const d = getDb()
  if (!input.items.length || !input.customer.name.trim() || !input.customer.phone.trim()) return fail('missing')
  const delivery = input.fulfilment === 'delivery'
  const items = input.items.map((it, i) => ({ ...it, id: `m-${i}` }))
  const lang = findCustomer(d, input.customer.phone, input.customer.email)?.lang ?? 'en'
  const { db, order } = createOrder(d, {
    source: 'manual', status: 'approved', customer: input.customer, fulfilment: input.fulfilment,
    address: delivery ? input.address : '', landmark: delivery ? input.landmark : '', date: input.date, window: input.window,
    items, deliveryFee: delivery ? input.deliveryFee : 0, total: orderTotal(items, input.deliveryFee, delivery),
    paid: input.paid, customerNote: '', adminNote: input.adminNote, lang,
  }, actor, 'created manual order (approved)')
  let next = upsertCustomer(db, input.customer, lang)
  next = emailCustomer(next, order, 'confirmed')
  updateDb(() => next)
  return { ok: true, order }
}

/* ---------- customer actions on the tracking page ---------- */

const customerActor = (o: Order): Actor => ({ kind: 'customer', name: o.customer.name })

export function customerCancel(token: string): Res {
  const o = getDb().orders.find((x) => x.token === token)
  return o ? moveOrder(o.id, 'cancelled', customerActor(o)) : fail('not_found')
}
export function customerAnswerQuote(token: string, accept: boolean): Res {
  const o = getDb().orders.find((x) => x.token === token)
  if (!o) return fail('not_found')
  return moveOrder(o.id, accept ? 'approved' : 'closed', customerActor(o))
}

/** Runs on load and whenever the clock moves: expired quotes close themselves. */
export function sweepExpiredQuotes(): void {
  const today = ymdOf(nowMs())
  for (const o of getDb().orders) {
    if (o.status !== 'quote_sent' || !o.quote || !quoteExpired(o.quote, today)) continue
    const res = mutate(o.id, undefined, (x) => withEvent({ ...x, status: 'closed' }, SYSTEM, 'quote expired, closed'))
    if (res.ok) {
      updateDb((d) => alertAdmins(emailCustomer(d, res.order, 'quote_closed'), `Quote expired ${o.number}`, o.customer.name, o.id, false))
    }
  }
}

export const defaultManualDate = (): string => addDays(ymdOf(nowMs()), 1)
