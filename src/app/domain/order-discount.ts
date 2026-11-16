// Order discounts (S-320, Owner request 2026-11-16; contracts.md "Order discounts"). Pure rules
// shared by the server (validation, rebasing on edit and re-quote), the admin form and the
// customer-facing totals. Money is whole rupees.
//
// `orders.total_rs` is the amount to pay AFTER the discount. The subtotal (full price) is
// `total + discount`; the discount applies to the goods = subtotal - delivery fee, so a delivery
// fee is never discounted and the total never drops below it (nor below Rs 0).
import type { OrderStatus } from "./status";

export const DISCOUNT_REASON_MAX = 80;
export const DISCOUNT_KINDS = ["amount", "percent"] as const;
export type DiscountKind = (typeof DISCOUNT_KINDS)[number];

/** What is stored on the order (null = no discount). */
export interface StoredDiscount {
  discountRs: number;
  /** The percentage typed (1..100), null for a fixed amount. */
  percent: number | null;
  reason: string | null;
}

/** Statuses in which a discount can be added, changed or removed, while the order is unpaid. */
export const DISCOUNT_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>(["pending_approval", "awaiting_payment", "quote_needed", "quote_sent"]);

/** Paid locks it (Undo of Payment received unlocks it); cancelled, declined, closed and later steps never take one. */
export function canEditDiscount(order: { status: OrderStatus; paid: boolean }): boolean {
  return DISCOUNT_STATUSES.has(order.status) && !order.paid;
}

/** The full price before the discount. */
export const subtotalOf = (order: { totalRs: number; discountRs: number | null }) => order.totalRs + (order.discountRs ?? 0);

/** What a discount applies to: the subtotal without the delivery fee, never negative. */
export const goodsOf = (subtotalRs: number, deliveryFeeRs: number) => Math.max(0, subtotalRs - deliveryFeeRs);

/** A percentage of the goods in whole rupees, half up. */
export const percentOf = (goodsRs: number, percent: number) => Math.floor((goodsRs * percent) / 100 + 0.5);

export type DiscountProblem = "value" | "reason";

export type ResolvedDiscount = { ok: true; discount: StoredDiscount } | { ok: false; field: DiscountProblem; maxRs: number };

/** "" or spaces → null; otherwise trimmed. */
export const cleanReason = (reason: string | null | undefined): string | null => {
  const trimmed = (reason ?? "").trim();
  return trimmed === "" ? null : trimmed;
};

/**
 * The discount an admin asked for, checked against the goods: a fixed amount Rs 1..goods, a
 * percentage 1..100 that comes to at least Rs 1. The reason is at most 80 characters.
 */
export function resolveDiscount(input: { kind: DiscountKind; value: number; reason?: string | null }, goodsRs: number): ResolvedDiscount {
  const reason = cleanReason(input.reason);
  if (reason !== null && reason.length > DISCOUNT_REASON_MAX) return { ok: false, field: "reason", maxRs: goodsRs };
  if (!Number.isInteger(input.value)) return { ok: false, field: "value", maxRs: goodsRs };
  if (input.kind === "percent") {
    if (input.value < 1 || input.value > 100) return { ok: false, field: "value", maxRs: goodsRs };
    const discountRs = percentOf(goodsRs, input.value);
    return discountRs < 1 ? { ok: false, field: "value", maxRs: goodsRs } : { ok: true, discount: { discountRs, percent: input.value, reason } };
  }
  if (input.value < 1 || input.value > goodsRs) return { ok: false, field: "value", maxRs: goodsRs };
  return { ok: true, discount: { discountRs: input.value, percent: null, reason } };
}

/**
 * The same discount on new goods (an edit or a re-quote changed the price): a percentage is
 * recomputed, a fixed amount is capped at the goods; one that comes to Rs 0 is removed (null).
 */
export function rebaseDiscount(discount: StoredDiscount | null, goodsRs: number): StoredDiscount | null {
  if (!discount) return null;
  const discountRs = discount.percent === null ? Math.min(discount.discountRs, goodsRs) : percentOf(goodsRs, discount.percent);
  return discountRs >= 1 ? { ...discount, discountRs } : null;
}

/** The stored columns as one value, or null. */
export function storedDiscount(row: { discountRs: number | null; discountPercent: number | null; discountReason: string | null }): StoredDiscount | null {
  return row.discountRs === null || row.discountRs <= 0 ? null : { discountRs: row.discountRs, percent: row.discountPercent, reason: row.discountReason };
}

/**
 * Per-product revenue (Sales top products): each line's share of the order's discount, in
 * proportion to its line total, rounded per line. Lines of an order without a discount keep
 * their line total.
 */
export function lineAfterDiscount(lineTotalRs: number, linesTotalRs: number, discountRs: number | null): number {
  if (!discountRs || linesTotalRs <= 0) return lineTotalRs;
  return lineTotalRs - Math.floor((discountRs * lineTotalRs) / linesTotalRs + 0.5);
}
