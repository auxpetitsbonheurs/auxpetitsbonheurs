// The public menu (ADR-0004): every product a customer can see (hidden ones are never
// included), its options and price, plus the checkout Settings the basket page shows. Served
// by GET /api/menu, embedded in the basket loader, and cached in the browser so the basket
// renders without a round trip. Pure: no I/O. Prices here are for display only; placeOrder
// re-prices on the server.
import type { LocalizedText, TimeWindow } from "~/db/tables/json-types";
import type { AvailabilityRules } from "./availability";
import type { BasketLine } from "./basket";
import { type LocalizedName, type PricedLine, type PricingProduct, priceLines } from "./pricing";
import type { SeasonWindow } from "./season";

export interface MenuOptionGroup {
  id: string;
  name: LocalizedName;
  kind: string;
  required: boolean;
  textMaxLength: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  choices: { id: string; name: LocalizedName; priceDeltaRs: number }[];
}

export interface MenuProduct {
  id: string;
  slug: string;
  type: string;
  name: LocalizedName;
  basePriceRs: number;
  /** Hidden products are left out of the menu altogether. */
  status: "available" | "sold_out";
  minQuantity: number | null;
  photos: { url: string; width: number; height: number }[];
  optionGroups: MenuOptionGroup[];
  /**
   * Seasonal window (S-049, Mauritius dates, ends included), null when not seasonal. Optional:
   * a copy cached before S-244 has none, which reads as "not seasonal".
   */
  season?: SeasonWindow | null;
  /** Own notice in days, null = the Settings default (S-083). Optional: absent from copies cached before. */
  noticeDays?: number | null;
}

export interface MenuCheckout {
  deliveryFeeRs: number;
  windows: { delivery: TimeWindow[]; pickup: TimeWindow[] };
  pickup: { address: string | null; mapUrl: string | null };
  payment: { juiceNumber: string | null };
  policies: LocalizedText | null;
  /**
   * The public date rules (S-083): notice, closed weekdays, blocked ranges from today (never
   * the private reason). Optional: a copy cached before has none, and the basket then asks
   * the server instead of guessing dates.
   */
  availability?: AvailabilityRules;
}

export interface Menu {
  products: MenuProduct[];
  checkout: MenuCheckout;
  /** The Mauritius date on the server clock when read (the checkout's earliest date). */
  today: string;
  /** Server time the menu was read (ms). Orders two copies; not part of the version. */
  generatedAt: number;
}

/** A versioned menu: `v` is the ETag (a hash of products and checkout, not `generatedAt`). */
export interface MenuEntry {
  v: string;
  data: Menu;
}

export interface PriceNote {
  fromRs: number;
  toRs: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

/** Light shape check for data read back from localStorage or the network. */
export function isMenuEntry(value: unknown): value is MenuEntry {
  if (!isRecord(value) || typeof value.v !== "string" || !isRecord(value.data)) return false;
  const { products, checkout, generatedAt } = value.data;
  return Array.isArray(products) && isRecord(checkout) && typeof checkout.deliveryFeeRs === "number" && typeof generatedAt === "number" && typeof value.data.today === "string"
    && products.every((p) => isRecord(p) && typeof p.id === "string" && typeof p.basePriceRs === "number" && isRecord(p.name));
}

/** The newer of two copies (by server read time); `a` wins a tie (it may carry a refusal's prices). */
export function fresherEntry(a: MenuEntry | null | undefined, b: MenuEntry): MenuEntry {
  return a && a.data.generatedAt >= b.data.generatedAt ? a : b;
}

function pricingProducts(menu: Menu): Map<string, PricingProduct> {
  return new Map(menu.products.map((p) => [p.id, { id: p.id, name: p.name, basePriceRs: p.basePriceRs, status: p.status }]));
}

/** Basket lines priced from the menu; a product missing from it (hidden, deleted) is `hidden`. */
export function priceBasket(lines: readonly BasketLine[], menu: Menu): PricedLine[] {
  return priceLines(lines, pricingProducts(menu));
}

/**
 * Items that will be ordered (header count, UX audit M1): lines whose product the menu has
 * as sold out, or that are known to have left the menu (`gone`), are not counted. A product
 * the menu does not know yet still counts, so a fresh Add never looks lost.
 */
export function orderableItemCount(lines: readonly BasketLine[], menu: Menu | null, gone: ReadonlySet<string>): number {
  const status = new Map(menu?.products.map((p) => [p.id, p.status]) ?? []);
  const leftOut = (id: string) => status.get(id) === "sold_out" || (gone.has(id) && !status.has(id));
  return lines.reduce((sum, line) => (leftOut(line.productId) ? sum : sum + line.quantity), 0);
}

/** Products whose price differs between two menus (products in both). */
export function priceChanges(previous: Menu, next: Menu): Map<string, PriceNote> {
  const before = new Map(previous.products.map((p) => [p.id, p.basePriceRs]));
  const changes = new Map<string, PriceNote>();
  for (const product of next.products) {
    const fromRs = before.get(product.id);
    if (fromRs !== undefined && fromRs !== product.basePriceRs) changes.set(product.id, { fromRs, toRs: product.basePriceRs });
  }
  return changes;
}

/** Accumulates notes: the first "from" is kept, the latest "to" wins, a round trip clears it. */
export function mergePriceNotes(notes: ReadonlyMap<string, PriceNote>, changes: ReadonlyMap<string, PriceNote>): Map<string, PriceNote> {
  const merged = new Map(notes);
  for (const [id, change] of changes) {
    const fromRs = notes.get(id)?.fromRs ?? change.fromRs;
    if (fromRs === change.toRs) merged.delete(id);
    else merged.set(id, { fromRs, toRs: change.toRs });
  }
  return merged;
}

/**
 * The menu as a placeOrder refusal (PRICE_CHANGED) describes it: each line's server unit
 * price, sold-out and hidden products, and the delivery fee. Same version family, so the
 * next network copy replaces it.
 */
export function menuWithServerPrices(entry: MenuEntry, lines: readonly Pick<PricedLine, "productId" | "unitPriceRs" | "problem">[], deliveryFeeRs: number | undefined): MenuEntry {
  const byId = new Map(lines.map((l) => [l.productId, l]));
  const products = entry.data.products
    .filter((p) => byId.get(p.id)?.problem !== "hidden" && byId.get(p.id)?.problem !== "out_of_season")
    .map((p) => {
      const line = byId.get(p.id);
      if (!line) return p;
      if (line.problem === "sold_out") return { ...p, status: "sold_out" as const };
      return { ...p, basePriceRs: line.unitPriceRs, status: "available" as const };
    });
  const checkout = deliveryFeeRs === undefined ? entry.data.checkout : { ...entry.data.checkout, deliveryFeeRs };
  return { v: `${entry.v}+refused`, data: { ...entry.data, products, checkout } };
}
