// Pricing and availability rules (pricing-availability-promotions spec). Minimal for the
// walking skeleton: base prices and the delivery fee. E-05 adds options, promotions,
// seasonal windows and notice rules behind the same functions.

export type ProductProblem = "sold_out" | "hidden" | "out_of_season";

export interface OrderableProduct {
  status: "available" | "sold_out" | "hidden";
}

/** Why a product cannot be ordered now; a missing (deleted) product counts as hidden. */
export function productProblem(product: OrderableProduct | undefined): ProductProblem | null {
  if (!product || product.status === "hidden") return "hidden";
  if (product.status === "sold_out") return "sold_out";
  return null;
}
