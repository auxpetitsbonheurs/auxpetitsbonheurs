// Menu builders for unit tests.
import type { Menu, MenuProduct } from "../menu";

export function menuProduct(id: string, basePriceRs: number, overrides: Partial<MenuProduct> = {}): MenuProduct {
  return { id, slug: id.slice(0, 4), type: "cake", name: { en: `P${id.slice(0, 1)}`, fr: null }, basePriceRs, status: "available", minQuantity: null, photos: [], optionGroups: [], ...overrides };
}

export function menu(products: MenuProduct[], generatedAt = 1000, deliveryFeeRs = 200): Menu {
  return {
    products,
    checkout: { deliveryFeeRs, windows: { delivery: [], pickup: [] }, pickup: { address: null, mapUrl: null }, payment: { juiceNumber: null }, policies: null },
    today: "2026-11-20",
    generatedAt,
  };
}
