// The browser's part of the promotion rules (S-082), kept tiny and import-free so pages at
// their JS budget can use it: the server ranks each product's live promotions with
// domain/promotions (lowest price, earlier start, lower id) when it reads the menu; the page
// only takes the first one whose end instant has not passed. Pure.

/** A live promotion's sale base price for one product; `endsAt` in epoch ms (end exclusive). */
export interface MenuPromo {
  id: string;
  salePriceRs: number;
  endsAt: number;
}

/** The promotion a product takes at `nowMs`: the best one not yet ended (FR-016, FR-017), or null. */
export function livePromo(product: { promos?: readonly MenuPromo[] }, nowMs: number): { promotionId: string; salePriceRs: number } | null {
  const promo = product.promos?.find((p) => nowMs < p.endsAt);
  return promo ? { promotionId: promo.id, salePriceRs: promo.salePriceRs } : null;
}
