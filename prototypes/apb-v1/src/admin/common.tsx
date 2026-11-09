import { Link } from 'react-router-dom'
import type { Actor, Order, Settings, Status } from '../domain/types'
import { formatRs } from '../domain/money'
import { fmtDate } from '../domain/time'
import { nextStatus } from '../domain/status'
import { tEn } from '../i18n'
import type { Key } from '../i18n'
import { useSession } from '../mocks/store'
import { Badge } from '../ui/ui'

export function useActor(): Actor {
  const { admin } = useSession()
  return { kind: 'admin', name: admin?.name ?? 'Admin' }
}

export const statusLabel = (s: Status): string => tEn(`st.${s}` as Key)

const TONES: Record<Status, 'rose' | 'green' | 'amber' | 'grey' | 'red'> = {
  pending: 'amber', quote_needed: 'amber', quote_sent: 'rose', approved: 'green', preparing: 'green',
  ready: 'green', out: 'green', completed: 'grey', declined: 'red', cancelled: 'red', closed: 'grey',
}
export const StatusBadge = ({ status }: { status: Status }) => <Badge tone={TONES[status]}>{statusLabel(status)}</Badge>

export const itemsText = (o: Order): string =>
  o.items.length ? o.items.map((i) => `${i.qty} x ${i.name.en}`).join(', ') : o.custom ? `Custom cake (${o.custom.occasion}, ${o.custom.servings} servings)` : '-'

export const windowLabel = (s: Settings, id: string): string => {
  const w = s.windows.find((x) => x.id === id)
  return w ? `${w.name.en} ${w.from}-${w.to}` : id
}
export const windowIndex = (s: Settings, id: string): number => s.windows.findIndex((w) => w.id === id)

export const NEXT_LABEL: Partial<Record<Status, string>> = {
  pending: 'Approve', approved: 'Start preparing', preparing: 'Mark ready / out', ready: 'Complete', out: 'Complete',
}
export const nextLabel = (o: Order): string | null => {
  const n = nextStatus(o)
  if (!n) return null
  if (o.status === 'preparing') return n === 'ready' ? 'Ready for pickup' : 'Out for delivery'
  return NEXT_LABEL[o.status] ?? null
}

export function OrderRow({ o, settings, action }: { o: Order; settings: Settings; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white p-3 shadow-soft">
      <Link to={`/admin/orders/${o.id}`} className="block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold">{o.number} · {o.customer.name}</p>
            <p className="truncate text-sm text-ink-soft">{itemsText(o)}</p>
          </div>
          <StatusBadge status={o.status} />
        </div>
        <p className="mt-1 text-sm">
          <span className={`font-semibold ${o.fulfilment === 'delivery' ? 'text-rose-700' : 'text-teal-700'}`}>{o.fulfilment === 'delivery' ? 'Delivery' : 'Pickup'}</span>
          {' · '}{fmtDate(o.date, 'en')} · {windowLabel(settings, o.window)}
          {' · '}{o.total > 0 ? formatRs(o.total) : 'No quote yet'}
          {o.total > 0 && ` · ${o.paid ? 'Paid' : 'Unpaid'}`}
        </p>
      </Link>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
