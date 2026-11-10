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
