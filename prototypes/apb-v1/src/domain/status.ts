import type { ActorKind, Fulfilment, Order, Source, Status } from './types'

type StatusInfo = Pick<Order, 'status' | 'fulfilment'>

const readyStatus = (f: Fulfilment): Status => (f === 'pickup' ? 'ready' : 'out')

/** Every move an actor may make from the order's current status. */
export function allowedMoves(o: StatusInfo, actor: ActorKind): Status[] {
  if (actor === 'system') return o.status === 'quote_sent' ? ['closed'] : []
  const admin = actor === 'admin'
  switch (o.status) {
    case 'pending': return admin ? ['approved', 'declined', 'cancelled'] : ['cancelled']
    case 'quote_needed': return admin ? ['quote_sent', 'declined', 'cancelled'] : ['cancelled']
    case 'quote_sent': return admin ? ['quote_sent', 'cancelled'] : ['approved', 'closed']
    case 'approved': return admin ? ['preparing', 'cancelled'] : []
    case 'preparing': return admin ? [readyStatus(o.fulfilment), 'cancelled'] : []
    case 'ready':
    case 'out': return admin ? ['completed', 'cancelled'] : []
    default: return []
  }
}

export const canTransition = (o: StatusInfo, to: Status, actor: ActorKind): boolean =>
  allowedMoves(o, actor).includes(to)

/** The one-tap "next status" for the main flow. */
export function nextStatus(o: StatusInfo): Status | null {
  switch (o.status) {
    case 'pending': return 'approved'
    case 'approved': return 'preparing'
    case 'preparing': return readyStatus(o.fulfilment)
    case 'ready':
    case 'out': return 'completed'
    default: return null
  }
}

/** Back one step to fix a mistake (no email). */
export function prevStatus(o: StatusInfo): Status | null {
  switch (o.status) {
    case 'completed': return readyStatus(o.fulfilment)
    case 'ready':
    case 'out': return 'preparing'
    case 'preparing': return 'approved'
    default: return null
  }
}

export const canCustomerCancel = (s: Status): boolean => s === 'pending' || s === 'quote_needed'
export const isClosedOut = (s: Status): boolean => s === 'declined' || s === 'cancelled' || s === 'closed'
export const countsOnCalendar = (s: Status): boolean => !isClosedOut(s)

export type EmailKind =
  | 'received' | 'request_received' | 'quote' | 'confirmed' | 'declined' | 'request_declined'
  | 'cancelled' | 'quote_closed' | 'ready' | 'onway' | 'thanks' | 'invitation'

/** Which customer email goes out for a move (null = none). */
export function emailForMove(from: Status, to: Status, source: Source): EmailKind | null {
  switch (to) {
    case 'quote_sent': return 'quote'
    case 'approved': return from === 'preparing' ? null : 'confirmed'
    case 'declined': return source === 'custom' ? 'request_declined' : 'declined'
    case 'cancelled': return 'cancelled'
    case 'closed': return 'quote_closed'
    case 'ready': return 'ready'
    case 'out': return 'onway'
    case 'completed': return 'thanks'
    default: return null
  }
}

/** Steps shown on the tracking progress bar. */
export function progressSteps(o: Pick<Order, 'source' | 'fulfilment'>): { key: Status; label: string }[] {
  const ready = o.fulfilment === 'pickup' ? 'ready' : 'out'
  const base: { key: Status; label: string }[] = [
    { key: 'approved', label: 'st.approved' },
    { key: 'preparing', label: 'st.preparing' },
    { key: ready, label: o.fulfilment === 'pickup' ? 'st.ready' : 'st.out' },
    { key: 'completed', label: 'st.completed' },
  ]
  return o.source === 'custom'
    ? [{ key: 'quote_needed', label: 'st.quote_needed' }, { key: 'quote_sent', label: 'st.quote_sent' }, ...base]
    : [{ key: 'pending', label: 'st.pending' }, ...base]
}
