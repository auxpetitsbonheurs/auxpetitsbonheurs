// Promotion rules (pricing-availability-promotions spec, S-082; FR-016, FR-017, FR-002, FR-004).
// One rule set: the server prices with it (product page, menu, placeOrder), the `place_order`
// procedure applies the same rules in SQL (drizzle/0012, `product_promotion`; tested to agree
// in promotions.sql.test.ts), and the browser only filters the server's ranked list by its
// end instant (domain/menu-promotions.ts). Pure: no db, react, router or network; `now` is injected.

export type PromoStatus = "scheduled" | "live" | "ended" | "inactive";
export type PromoPlacement = "banner" | "card" | "both";

/** A product's discount in a promotion (promotion_product row). */
export interface Discount {
  kind: "percent" | "sale_price";
  percentOff?: number | null;
  salePriceRs?: number | null;
}

export interface PromotionDiscount extends Discount {
  productId: string;
}

/** An instant: a Date, epoch ms, or an ISO string (as a JSON snapshot carries it). */
export type Instant = Date | number | string;

/** What the rules read of a promotion. */
export interface PromotionRule {
  id: string;
  startsAt: Instant;
  endsAt: Instant;
  active: boolean;
  placement: PromoPlacement;
  discounts?: readonly PromotionDiscount[];
}

/** The applied promotion of a line (pricing-core AppliedPromotion). */
export interface BestPromotion {
  promotionId: string;
  salePriceRs: number;
}

const ms = (value: Instant): number => (value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value));

/** Live = active and startsAt <= now < endsAt (end exclusive); a window with endsAt <= startsAt is never live. */
export function isLive(promotion: Pick<PromotionRule, "active" | "startsAt" | "endsAt">, now: Date): boolean {
  const t = now.getTime();
  return promotion.active && ms(promotion.startsAt) <= t && t < ms(promotion.endsAt);
}

/** The admin badge (S-052): inactive wins over dates; then before, inside or after the window. */
export function promotionStatus(promotion: Pick<PromotionRule, "active" | "startsAt" | "endsAt">, now: Date): PromoStatus {
  if (!promotion.active) return "inactive";
  if (now.getTime() < ms(promotion.startsAt)) return "scheduled";
  return isLive(promotion, now) ? "live" : "ended";
}

/**
 * The sale price of `baseRs` under a discount, or null when it is not a discount: percent
 * must be a whole 1..99 (half up to whole rupees: floor((base x (100 - pct) + 50) / 100));
 * a fixed price must be a whole rupee amount >= 0; either way the result must be below base.
 */
export function salePriceRs(baseRs: number, discount: Discount): number | null {
  let sale: number | null = null;
  if (discount.kind === "percent") {
    const pct = discount.percentOff;
    if (typeof pct === "number" && Number.isInteger(pct) && pct >= 1 && pct <= 99) sale = Math.floor((baseRs * (100 - pct) + 50) / 100);
  } else {
    const price = discount.salePriceRs;
    if (typeof price === "number" && Number.isInteger(price) && price >= 0) sale = price;
  }
  return sale !== null && sale < baseRs ? sale : null;
}

/** a before b: lower price, then earlier start, then lower id (FR-017 tie-break; SQL ORDER BY sale, starts_at, id). */
function better(a: { sale: number; start: number; id: string }, b: { sale: number; start: number; id: string }): boolean {
  if (a.sale !== b.sale) return a.sale < b.sale;
  if (a.start !== b.start) return a.start < b.start;
  return a.id < b.id;
}

/**
 * Every live promotion's sale price for the product, best first (lowest price, earlier
 * start, lower id). Offers never add up: a line takes the first, alone.
 */
export function rankedOffers(productId: string, baseRs: number, promotions: readonly PromotionRule[], now: Date): (BestPromotion & { startsAt: number; endsAt: number })[] {
  const offers: { sale: number; start: number; end: number; id: string }[] = [];
  for (const promotion of promotions) {
    if (!isLive(promotion, now)) continue;
    for (const discount of promotion.discounts ?? []) {
      if (discount.productId !== productId) continue;
      const sale = salePriceRs(baseRs, discount);
      if (sale !== null) offers.push({ sale, start: ms(promotion.startsAt), end: ms(promotion.endsAt), id: promotion.id });
    }
  }
  offers.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  return offers.map((o) => ({ promotionId: o.id, salePriceRs: o.sale, startsAt: o.start, endsAt: o.end }));
}

/** The lowest live price for the product, or null (FR-017: the lowest wins, no stacking). */
export function bestPromotion(productId: string, baseRs: number, promotions: readonly PromotionRule[], now: Date): BestPromotion | null {
  const best = rankedOffers(productId, baseRs, promotions, now)[0];
  return best ? { promotionId: best.promotionId, salePriceRs: best.salePriceRs } : null;
}

const latestFirst = (a: PromotionRule, b: PromotionRule) => ms(b.startsAt) - ms(a.startsAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The banner (FR-002): the live banner or both promotion with the latest start (ties: lowest id); card-only never. */
export function liveBanner<P extends PromotionRule>(promotions: readonly P[], now: Date): P | null {
  return promotions.filter((p) => p.placement !== "card" && isLive(p, now)).sort(latestFirst)[0] ?? null;
}

/** Home promotion cards (FR-004): live card or both promotions, latest start first, then id; banner-only never. */
export function liveCards<P extends PromotionRule>(promotions: readonly P[], now: Date): P[] {
  return promotions.filter((p) => p.placement !== "banner" && isLive(p, now)).sort(latestFirst);
}
