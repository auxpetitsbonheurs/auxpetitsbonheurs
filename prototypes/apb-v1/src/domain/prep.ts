import type { Order } from './types'
import { countsOnCalendar } from './status'

export interface PrepVariant { label: string; qty: number; messages: string[]; extras: string[] }
export interface PrepGroup { product: string; qty: number; variants: PrepVariant[] }

/** Items of one day grouped by product, then by size/flavour (pick-one options). */
export function prepList(orders: Order[], ymd: string): PrepGroup[] {
  const groups = new Map<string, Map<string, PrepVariant>>()
  for (const o of orders) {
    if (o.date !== ymd || !countsOnCalendar(o.status)) continue
    for (const it of o.items) {
      const product = it.name.en
      const label = it.options.filter((x) => x.kind === 'one').map((x) => x.choice.en).join(' / ') || '-'
      const variants = groups.get(product) ?? new Map<string, PrepVariant>()
      const v = variants.get(label) ?? { label, qty: 0, messages: [], extras: [] }
      v.qty += it.qty
      if (it.message) v.messages.push(`${it.message} (${o.number})`)
      const extras = it.options.filter((x) => x.kind === 'several').map((x) => x.choice.en)
      if (extras.length) v.extras.push(`${extras.join(', ')} (${o.number})`)
      variants.set(label, v)
      groups.set(product, variants)
    }
  }
  return [...groups.entries()].map(([product, variants]) => {
    const list = [...variants.values()]
    return { product, qty: list.reduce((s, v) => s + v.qty, 0), variants: list }
  })
}
