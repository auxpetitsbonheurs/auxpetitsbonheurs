import type {
  OptionGroup, OrderItemOption, PricedLine, Product, Promotion, PromoItem, Selection,
} from './types'
import { ymdOf } from './time'

export type PromoStatus = 'inactive' | 'scheduled' | 'live' | 'ended'

export function promoStatus(p: Promotion, now: number): PromoStatus {
  if (!p.active) return 'inactive'
  if (now < p.startMs) return 'scheduled'
  if (now > p.endMs) return 'ended'
  return 'live'
}
export const isLive = (p: Promotion, now: number): boolean => promoStatus(p, now) === 'live'

export function discountedBase(base: number, item: PromoItem): number {
  return item.kind === 'percent' ? Math.round((base * (100 - item.value)) / 100) : item.value
}

export interface BestPrice { price: number; original: number; promoId?: string }

/** Lowest base price from live promotions; discounts never stack. */
export function bestPrice(product: Product, promos: Promotion[], now: number): BestPrice {
  let price = product.basePrice
  let promoId: string | undefined
  for (const p of promos) {
    if (!isLive(p, now)) continue
    for (const it of p.items) {
      if (it.productId !== product.id) continue
      const d = discountedBase(product.basePrice, it)
      if (d < price) {
        price = d
        promoId = p.id
      }
    }
  }
  return { price, original: product.basePrice, promoId }
}

export function quantityGroup(product: Product): OptionGroup | undefined {
  return product.groups.find((g) => g.kind === 'quantity')
}
export function quantityBounds(product: Product): { min: number; max: number } {
  const g = quantityGroup(product)
  return g ? { min: g.qtyMin ?? 1, max: g.qtyMax ?? 99 } : { min: 1, max: 20 }
}

export function defaultSelection(product: Product): Selection {
  return { choices: {}, texts: {}, qty: quantityBounds(product).min }
}

export interface SelectionProblem { groupId: string; reason: 'required' | 'limit' | 'qty' }

export function selectionProblems(product: Product, sel: Selection): SelectionProblem[] {
  const out: SelectionProblem[] = []
  for (const g of product.groups) {
    if (g.kind === 'one' || g.kind === 'several') {
      const chosen = (sel.choices[g.id] ?? []).filter((id) => g.choices.some((c) => c.id === id))
      if (g.required && chosen.length === 0) out.push({ groupId: g.id, reason: 'required' })
    }
    if (g.kind === 'text') {
      const t = (sel.texts[g.id] ?? '').trim()
      if (g.required && !t) out.push({ groupId: g.id, reason: 'required' })
      if (g.charLimit && t.length > g.charLimit) out.push({ groupId: g.id, reason: 'limit' })
    }
  }
  const b = quantityBounds(product)
  if (!Number.isInteger(sel.qty) || sel.qty < b.min || sel.qty > b.max) {
    out.push({ groupId: quantityGroup(product)?.id ?? 'qty', reason: 'qty' })
  }
  return out
}

/**
 * Item price = (base + option price changes) x quantity. Promotions touch the base price only.
 * The same function runs for the live price on the product page and when the order is sent.
 */
export function priceLine(product: Product, sel: Selection, promos: Promotion[], now: number): PricedLine {
  const best = bestPrice(product, promos, now)
  const options: OrderItemOption[] = []
  let message: string | undefined
  for (const g of product.groups) {
    if (g.kind === 'text') {
      const t = (sel.texts[g.id] ?? '').trim()
      if (t) message = g.charLimit ? t.slice(0, g.charLimit) : t
      continue
    }
    if (g.kind === 'quantity') continue
    for (const id of sel.choices[g.id] ?? []) {
      const c = g.choices.find((x) => x.id === id)
      if (c) options.push({ group: g.name, choice: c.name, price: c.price, kind: g.kind })
    }
  }
  const unit = best.price + options.reduce((s, o) => s + o.price, 0)
  return {
    productId: product.id,
    name: product.name,
    options,
    message,
    qty: sel.qty,
    basePrice: best.price,
    originalBase: best.original,
    promoId: best.promoId,
    unit,
    lineTotal: unit * sel.qty,
  }
}

export function orderTotal(lines: { lineTotal: number }[], deliveryFee: number, delivery: boolean): number {
  return lines.reduce((s, l) => s + l.lineTotal, 0) + (delivery ? deliveryFee : 0)
}

/** Seasonal window (inclusive, Mauritius dates). */
export function inSeason(p: Product, now: number): boolean {
  const today = ymdOf(now)
  if (p.seasonStart && today < p.seasonStart) return false
  if (p.seasonEnd && today > p.seasonEnd) return false
  return true
}
export const isVisible = (p: Product, now: number): boolean => p.status !== 'hidden' && inSeason(p, now)
export const isOrderable = (p: Product, now: number): boolean => p.status === 'available' && inSeason(p, now)
