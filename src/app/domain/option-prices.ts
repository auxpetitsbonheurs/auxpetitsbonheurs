// The lowest price option groups allow (S-048 editor warning, S-081 "from Rs X"). Its own
// module so the product editor does not load the whole pricing domain (its route is at its
// JS budget). Pure.

/** What the price rules need from an option group (editor state or stored record). */
export interface PricedOptionGroup {
  kind: string;
  required: boolean;
  quantityMin?: number | null;
  quantityMax?: number | null;
  choices: readonly { priceDeltaRs: number }[];
}

/** What a group can take off (or must add to) the cheapest valid configuration. */
function lowestContribution(group: PricedOptionGroup): number {
  const deltas = group.choices.map((c) => c.priceDeltaRs);
  if (deltas.length === 0 || group.kind === "text") return 0;
  const lowest = Math.min(...deltas);
  const negatives = deltas.filter((d) => d < 0).reduce((sum, d) => sum + d, 0);
  if (group.kind === "single") return group.required ? lowest : Math.min(0, lowest);
  if (group.kind === "multiple") return negatives < 0 ? negatives : group.required ? lowest : 0;
  // quantity: every unit may be the cheapest choice; a required group takes at least one
  const least = group.required ? Math.max(1, group.quantityMin ?? 0) : 0;
  const units = lowest < 0 ? (group.quantityMax ?? 1) : least;
  return lowest * units;
}

/** The lowest unit price the choices allow: base plus the most every group can take off. */
export function lowestOptionPrice(basePriceRs: number, groups: readonly PricedOptionGroup[]): number {
  return groups.reduce((price, group) => price + lowestContribution(group), basePriceRs);
}

/** S-048 AC7: "This option can make the price below Rs 0" (a warning; saving is allowed). */
export function optionsCanGoBelowZero(basePriceRs: number, groups: readonly PricedOptionGroup[]): boolean {
  return lowestOptionPrice(basePriceRs, groups) < 0;
}

/**
 * "from Rs X" (cards, product page heading; S-081 AC10): the cheapest valid configuration of
 * the base (or sale) price, never below 0. Here, not in pricing.ts, so the menu page stays light.
 */
export function fromPriceRs(product: { basePriceRs: number; optionGroups?: readonly PricedOptionGroup[] }, promo?: { promotionId: string; salePriceRs: number } | null): number {
  return Math.max(0, lowestOptionPrice(promo?.salePriceRs ?? product.basePriceRs, product.optionGroups ?? []));
}
