// Pricing a basket from the cached menu (ADR-0004, S-081): the basket page's lines, each
// line's "Price updated" note (a refusal's prices: menu-refusal.ts, loaded on demand). Apart
// from menu.ts so the header count (every page) does not load the pricing rules. Pure.
import type { BasketLine } from "./basket";
import { livePromo } from "./live-promo";
import { type Menu, type MenuProduct, type PriceNote, menuLimits } from "./menu";
import { type PricedLine, type ProductPricing, linePrice, priceBasket } from "./pricing-core";

/** A menu product as the pricing rules read it. */
export function productPricing(product: MenuProduct): ProductPricing {
  return product;
}

/**
 * Basket lines priced from the menu; a product missing from it (hidden, deleted) is `hidden`.
 * A live promotion (S-082) replaces the base price until its end instant `nowMs` passes.
 */
export function priceBasketFromMenu(lines: readonly BasketLine[], menu: Menu, today: string = menu.today, nowMs: number = Date.now()): PricedLine[] {
  const products = new Map(menu.products.map((p) => [p.id, p]));
  const promotionFor = (p: ProductPricing) => livePromo(products.get(p.id) ?? {}, nowMs);
  return priceBasket(lines, products, { fulfilment: null, deliveryFeeRs: menu.checkout.deliveryFeeRs, limits: menuLimits(menu), today, promotionFor }).lines;
}

/**
 * One line's unit price before and now ("Price updated from Rs X to Rs Y"), or null when it did
 * not change. The earlier copy's best promotion is the price that was shown (a promotion that
 * ended since is why the price changed); the current copy's applies until it ends.
 */
export function linePriceNote(line: BasketLine, note: PriceNote | undefined, now: MenuProduct | undefined, nowMs: number = Date.now()): { fromRs: number; toRs: number } | null {
  if (!note || !now) return null;
  try {
    const fromRs = linePrice(productPricing(note.before), line, livePromo(note.before, -Infinity)).unitPriceRs;
    const toRs = linePrice(productPricing(now), line, livePromo(now, nowMs)).unitPriceRs;
    return fromRs === toRs ? null : { fromRs, toRs };
  } catch {
    return null; // the options changed too: the line says so instead
  }
}
