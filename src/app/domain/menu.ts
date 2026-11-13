// The public menu (ADR-0004): every product a customer can see (hidden ones are never
// included), its options and price, plus the checkout Settings the basket page shows. Served
// by GET /api/menu, embedded in the basket loader, and cached in the browser so the basket
// renders without a round trip. Pure: no I/O. Prices here are for display only; placeOrder
// re-prices on the server. Pricing a basket from the menu lives in menu-pricing.ts, so pages
// that only show the header count do not load the pricing rules.
import type { LocalizedText, TimeWindow } from "~/db/tables/json-types";
import type { AvailabilityRules } from "./availability";
import type { BasketLine } from "./basket";
import type { LocalizedName, PricingLimits } from "./pricing";
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
  /** Settings limits the product page and basket check against (S-067). Optional: older cached copies have none. */
  limits?: PricingLimits;
}

/** A versioned menu: `v` is the ETag (a hash of products and checkout, not `generatedAt`). */
export interface MenuEntry {
  v: string;
  data: Menu;
}

/** A product whose prices changed since the page first saw it: its earlier pricing (ADR-0004 notes). */
export interface PriceNote {
  before: MenuProduct;
}

/** Text limits when a cached copy has none: the most any field takes (the server still decides). */
export const FALLBACK_LIMITS: PricingLimits = { cakeMessageMax: 200 };

export const menuLimits = (menu: Pick<Menu, "limits">): PricingLimits => menu.limits ?? FALLBACK_LIMITS;

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

/** Everything that sets a product's prices: base and every choice's delta. */
function pricingSignature(product: MenuProduct): string {
  return JSON.stringify([product.basePriceRs, product.optionGroups.map((g) => [g.id, g.kind, g.choices.map((c) => [c.id, c.priceDeltaRs])])]);
}

/** Products (in both menus) whose base price or option prices differ: their earlier copy. */
export function priceChanges(previous: Menu, next: Menu): Map<string, PriceNote> {
  const before = new Map(previous.products.map((p) => [p.id, p]));
  const changes = new Map<string, PriceNote>();
  for (const product of next.products) {
    const old = before.get(product.id);
    if (old && pricingSignature(old) !== pricingSignature(product)) changes.set(product.id, { before: old });
  }
  return changes;
}

/** Accumulates notes against the latest menu: the first earlier copy is kept; a round trip back clears it. */
export function mergePriceNotes(notes: ReadonlyMap<string, PriceNote>, changes: ReadonlyMap<string, PriceNote>, next: Menu): Map<string, PriceNote> {
  const merged = new Map(notes);
  for (const [id, change] of changes) if (!merged.has(id)) merged.set(id, change);
  const current = new Map(next.products.map((p) => [p.id, p]));
  for (const [id, note] of merged) {
    const now = current.get(id);
    if (!now || pricingSignature(now) === pricingSignature(note.before)) merged.delete(id);
  }
  return merged;
}

