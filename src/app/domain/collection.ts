// "Our collection" (FR-077, S-244): the public menu grouped by type for the /menu page. Pure:
// it reads the same MenuEntry as GET /api/menu and the basket (ADR-0004), never a second
// query path. Prices are for display; placeOrder re-prices on the server.
import type { Menu, MenuProduct } from "./menu";
import type { ProductType } from "./product";
import { isInSeason } from "./season";

/**
 * The menu's type order (= `PRODUCT_TYPES`, checked by collection.test.ts). Repeated here, not
 * imported: importing domain/product would split it into its own chunk shared with the product
 * editor, whose route is at its JS budget (S-244 AC8).
 */
export const COLLECTION_TYPE_ORDER: readonly ProductType[] = ["cake", "cupcake_box", "dessert", "seasonal"];

export interface CollectionSection {
  type: ProductType;
  products: MenuProduct[];
}

/** True when the product must be configured before it can be added (a required size or box). */
export function needsOptions(product: Pick<MenuProduct, "optionGroups">): boolean {
  return product.optionGroups.some((group) => group.required);
}

/**
 * The lowest price a customer can pay for one unit ("from Rs X"): the base price plus, for
 * each required pick-one or pick-several group, its cheapest choice. Optional groups, text
 * and quantity groups add nothing to the lowest price.
 */
export function fromPriceRs(product: Pick<MenuProduct, "basePriceRs" | "optionGroups">): number {
  let price = product.basePriceRs;
  for (const group of product.optionGroups) {
    if (!group.required || (group.kind !== "single" && group.kind !== "multiple") || group.choices.length === 0) continue;
    price += Math.min(...group.choices.map((c) => c.priceDeltaRs));
  }
  return Math.max(0, price);
}

/** Seasonal products show only inside their window on `today` (Mauritius date, ends included). */
function inSeasonToday(product: MenuProduct, today: string): boolean {
  return isInSeason(product.season ?? null, today);
}

/**
 * Sections in the menu's type order (cake, cupcake box, dessert, seasonal), each with its
 * products in `sort_order` (the menu's order). Hidden products are never in the menu; products
 * outside their season and types with no product left are omitted (no empty heading).
 */
export function collectionSections(menu: Pick<Menu, "products">, today: string): CollectionSection[] {
  const shown = menu.products.filter((p) => inSeasonToday(p, today));
  return COLLECTION_TYPE_ORDER.map((type) => ({ type, products: shown.filter((p) => p.type === type) })).filter((s) => s.products.length > 0);
}
