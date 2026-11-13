// The menu as a PRICE_CHANGED refusal describes it (ADR-0004): loaded only when a refusal
// arrives, so the basket page's first load stays inside its JS budget. Pure.
import type { MenuEntry, MenuProduct } from "./menu";
import type { PricedLine, PricedOption } from "./pricing-core";

export type RefusedLine = Pick<PricedLine, "productId" | "unitPriceRs" | "problem"> & { options?: readonly Pick<PricedOption, "choiceId" | "priceDeltaRs" | "quantity">[] };

/** The product as a refused line priced it: base = unit price less the options, and each chosen option's delta. */
function withServerPrices(product: MenuProduct, line: RefusedLine): MenuProduct {
  const options = line.options ?? [];
  const deltas = new Map(options.flatMap((o) => (o.choiceId ? [[o.choiceId, o.quantity ? o.priceDeltaRs / o.quantity : o.priceDeltaRs] as const] : [])));
  const optionGroups = product.optionGroups.map((g) => ({ ...g, choices: g.choices.map((c) => ({ ...c, priceDeltaRs: deltas.get(c.id) ?? c.priceDeltaRs })) }));
  const basePriceRs = line.unitPriceRs - options.reduce((sum, o) => sum + o.priceDeltaRs, 0);
  return { ...product, basePriceRs, optionGroups, status: "available" };
}

/**
 * The menu as a placeOrder refusal (PRICE_CHANGED) describes it: each line's server prices
 * (base and chosen options), sold-out and hidden products, and the delivery fee. Same
 * version family, so the next network copy replaces it.
 */
export function menuWithServerPrices(entry: MenuEntry, lines: readonly RefusedLine[], deliveryFeeRs: number | undefined): MenuEntry {
  const byId = new Map(lines.map((l) => [l.productId, l]));
  const products = entry.data.products
    .filter((p) => byId.get(p.id)?.problem !== "hidden" && byId.get(p.id)?.problem !== "out_of_season")
    .map((p) => {
      const line = byId.get(p.id);
      if (!line || line.problem === "options_changed") return p;
      if (line.problem === "sold_out") return { ...p, status: "sold_out" as const };
      return withServerPrices(p, line);
    });
  const checkout = deliveryFeeRs === undefined ? entry.data.checkout : { ...entry.data.checkout, deliveryFeeRs };
  return { v: `${entry.v}+refused`, data: { ...entry.data, products, checkout } };
}
