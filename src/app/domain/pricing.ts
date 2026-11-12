// Pricing and availability rules (pricing-availability-promotions spec). Minimal for the
// walking skeleton: base price x quantity, plus the delivery fee. E-05 adds options,
// promotions, seasonal windows and notice rules behind these same functions.
import type { BasketLine } from "./basket";

export type ProductProblem = "sold_out" | "hidden" | "out_of_season";
export type Fulfilment = "delivery" | "pickup";

export interface LocalizedName {
  en: string;
  fr: string | null;
}

export interface OrderableProduct {
  status: "available" | "sold_out" | "hidden";
}

export interface PricingProduct extends OrderableProduct {
  id: string;
  name: LocalizedName;
  basePriceRs: number;
}

/** contracts.md `PricedLine`. */
export interface PricedLine {
  lineId: string;
  productId: string;
  name: LocalizedName;
  options: { label: LocalizedName; priceDeltaRs: number }[];
  cakeMessage: string | null;
  quantity: number;
  unitPriceRs: number;
  originalUnitPriceRs: number;
  lineTotalRs: number;
  promotionId: string | null;
  problem: ProductProblem | null;
}

export interface CheckoutTotals {
  itemsTotalRs: number;
  deliveryFeeRs: number;
  totalRs: number;
}

/** Why a product cannot be ordered now; a missing (deleted) product counts as hidden. */
export function productProblem(product: OrderableProduct | undefined): ProductProblem | null {
  if (!product || product.status === "hidden") return "hidden";
  if (product.status === "sold_out") return "sold_out";
  return null;
}

/** Prices every basket line from the server's product data (never from the client). */
export function priceLines(lines: readonly BasketLine[], products: ReadonlyMap<string, PricingProduct>): PricedLine[] {
  return lines.map((line) => {
    const product = products.get(line.productId);
    const unitPriceRs = product?.basePriceRs ?? 0;
    return {
      lineId: line.lineId,
      productId: line.productId,
      name: product?.name ?? { en: "", fr: null },
      options: [],
      cakeMessage: line.cakeMessage ?? null,
      quantity: line.quantity,
      unitPriceRs,
      originalUnitPriceRs: unitPriceRs,
      lineTotalRs: unitPriceRs * line.quantity,
      promotionId: null,
      problem: productProblem(product),
    };
  });
}

/** Delivery costs the Settings fee at the time of the request; pickup is free (FR-019). */
export function deliveryFeeFor(fulfilment: Fulfilment | null, settingsFeeRs: number): number {
  return fulfilment === "delivery" ? settingsFeeRs : 0;
}

/** Items (orderable lines only) + fee = total. */
export function checkoutTotals(lines: readonly PricedLine[], fulfilment: Fulfilment | null, settingsFeeRs: number): CheckoutTotals {
  const itemsTotalRs = lines.filter((l) => l.problem === null).reduce((sum, l) => sum + l.lineTotalRs, 0);
  const deliveryFeeRs = deliveryFeeFor(fulfilment, settingsFeeRs);
  return { itemsTotalRs, deliveryFeeRs, totalRs: itemsTotalRs + deliveryFeeRs };
}

// ---------------------------------------------------------------------------
// Option groups (S-048). The editor warns, the order step decides (line total >= 0).

/** What the price rules need from an option group (editor state or stored record). */
export interface PricedOptionGroup {
  kind: "single" | "multiple" | "text" | "quantity";
  required: boolean;
  quantityMin?: number | null;
  quantityMax?: number | null;
  choices: readonly { priceDeltaRs: number }[];
}

/** The most a group can take off the price (0 or negative). */
function lowestContribution(group: PricedOptionGroup): number {
  const deltas = group.choices.map((c) => c.priceDeltaRs);
  if (deltas.length === 0 || group.kind === "text") return 0;
  const lowest = Math.min(...deltas);
  const negatives = deltas.filter((d) => d < 0).reduce((sum, d) => sum + d, 0);
  if (group.kind === "single") return group.required ? lowest : Math.min(0, lowest);
  if (group.kind === "multiple") return negatives < 0 ? negatives : group.required ? lowest : 0;
  // quantity: every unit may be the cheapest choice
  const units = lowest < 0 ? (group.quantityMax ?? 1) : (group.quantityMin ?? 0);
  return lowest * units;
}

/** The lowest unit price the choices allow: base plus the most every group can take off. */
export function lowestOptionPrice(basePriceRs: number, groups: readonly PricedOptionGroup[]): number {
  return groups.reduce((price, group) => price + lowestContribution(group), basePriceRs);
}

/** AC7: "This option can make the price below Rs 0" (a warning; saving is allowed). */
export function optionsCanGoBelowZero(basePriceRs: number, groups: readonly PricedOptionGroup[]): boolean {
  return lowestOptionPrice(basePriceRs, groups) < 0;
}

/**
 * A customer's text for a text group (FR-008): `missing` when required and blank, `too_long`
 * over the group's limit or, when blank, the Settings cake message length. Shared by the
 * browser (basket form) and the server (addToBasket / placeOrder, E-04/E-05).
 */
export function textOptionProblem(text: string | undefined, group: { required: boolean; textMaxLength: number | null }, settingsMax: number): "missing" | "too_long" | null {
  const value = (text ?? "").trim();
  if (value === "") return group.required ? "missing" : null;
  return [...value].length > (group.textMaxLength ?? settingsMax) ? "too_long" : null;
}
