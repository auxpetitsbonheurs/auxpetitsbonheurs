// Pricing core (S-081): the types, what a line costs, problem lines and totals. Small on
// purpose: the basket page prices from the cached menu with this alone (its route is at its
// JS budget). The strict selection rules (every issue, grapheme limits) are in pricing.ts,
// which the server, the product page and placeOrder use; the server is always the authority.
// Pure: no db, react, router or network imports, no clock (dates are passed in).
import type { NewBasketLine, OptionPick } from "./basket";
import { DomainError } from "./errors";
import { type SeasonWindow, productProblem } from "./season";
import { checkoutTotals } from "./basket";

/**
 * Why a line cannot be ordered now: a missing (deleted) product counts as hidden;
 * `options_changed` = the chosen options are no longer valid for the product (a choice or
 * group was removed, a required group was added, a limit changed), so it is left out like an
 * unavailable line (ADR-0004) and the customer chooses again.
 */
export type ProductProblem = "sold_out" | "hidden" | "out_of_season" | "options_changed";
export type Fulfilment = "delivery" | "pickup";

export interface LocalizedName {
  en: string;
  fr: string | null;
}

export interface PricingChoice {
  id: string;
  name: LocalizedName;
  priceDeltaRs: number;
}

/** An option group as the rules read it (menu, product page, place_order snapshot). */
export interface PricingGroup {
  id: string;
  name: LocalizedName;
  kind: string;
  required: boolean;
  textMaxLength: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  choices: readonly PricingChoice[];
}

export interface OrderableProduct {
  status: "available" | "sold_out" | "hidden";
  season?: SeasonWindow | null;
}

/** Everything the rules need about a product (catalogue, menu or order snapshot). */
export interface ProductPricing extends OrderableProduct {
  id: string;
  name: LocalizedName;
  basePriceRs: number;
  minQuantity?: number | null;
  optionGroups?: readonly PricingGroup[];
}

/** @deprecated name kept for older callers; same shape as ProductPricing. */
export type PricingProduct = ProductPricing;

/** What the customer chose: ids, picks, message and quantity. Never a price (FR-011). */
export type LineInput = Omit<NewBasketLine, "options"> & { lineId?: string; options: readonly OptionPick[] };

export interface PricingLimits {
  /** Settings `cake_message_max` (default 40): the cake message and text groups without their own limit. */
  cakeMessageMax: number;
}

export type SelectionIssueCode = "quantity" | "below_min" | "required" | "too_many" | "unknown_choice" | "duplicate" | "quantity_range" | "too_long";

/** One problem with a selection. `field` is `quantity`, `cakeMessage` or `options.<groupId>`. */
export interface SelectionIssue {
  field: string;
  code: SelectionIssueCode;
  groupId?: string;
  /** The limit that was passed (`too_long`, `below_min`, `quantity_range`). */
  limit?: number;
}

/** A chosen option on a priced line; `priceDeltaRs` is what it adds to one unit. */
export interface PricedOption {
  groupId: string;
  group: LocalizedName;
  kind: string;
  choiceId: string | null;
  label: LocalizedName;
  priceDeltaRs: number;
  quantity?: number;
  text?: string;
}

/** contracts.md `PricedLine` (options carry their group and choice ids since v0.35). */
export interface PricedLine {
  lineId: string;
  productId: string;
  name: LocalizedName;
  options: PricedOption[];
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

export interface PricedBasket extends CheckoutTotals {
  lines: PricedLine[];
}

/** The promotion applied to a line (S-082 chooses it; null = none). */
export type AppliedPromotion = { promotionId: string; salePriceRs: number } | null;

export const MONEY_MAX_RS = 1_000_000;
export const LINE_QUANTITY_MAX = 50;
/** OptionPick.quantity is at most 99 (contracts.md). */
export const PICK_QUANTITY_MAX = 99;

/** NFC and trimmed; blank (spaces only) is absent. */
export function cleanText(value: string | undefined): string | undefined {
  const text = value?.normalize("NFC").trim();
  return text ? text : undefined;
}

export { productProblem } from "./season";

export const pickQuantity = (pick: OptionPick | undefined) => pick?.quantity ?? 0;

/** The choice a quantity pick counts: the chosen one, or the group's only choice. */
export function quantityChoice(group: PricingGroup, pick: OptionPick): PricingChoice | undefined {
  const id = pick.choiceIds[0];
  return id === undefined ? (group.choices.length === 1 ? group.choices[0] : undefined) : group.choices.find((c) => c.id === id);
}

/** The picks as priced options, in the product's group order (what a unit adds). */
export function pricedOptions(product: ProductPricing, picks: readonly OptionPick[]): PricedOption[] {
  const options: PricedOption[] = [];
  for (const group of product.optionGroups ?? []) {
    const pick = picks.find((p) => p.groupId === group.id);
    if (!pick) continue;
    const base = { groupId: group.id, group: group.name, kind: group.kind };
    if (group.kind === "text") {
      const text = cleanText(pick.text);
      if (text) options.push({ ...base, choiceId: null, label: group.name, priceDeltaRs: 0, text });
    } else if (group.kind === "quantity") {
      const choice = quantityChoice(group, pick);
      const quantity = pickQuantity(pick);
      if (choice && quantity > 0) options.push({ ...base, choiceId: choice.id, label: choice.name, priceDeltaRs: choice.priceDeltaRs * quantity, quantity });
    } else {
      for (const choice of group.choices) if (pick.choiceIds.includes(choice.id)) options.push({ ...base, choiceId: choice.id, label: choice.name, priceDeltaRs: choice.priceDeltaRs });
    }
  }
  return options;
}

/** A line from the picks that exist on the product; `promo` replaces the base price. */
function buildLine(input: LineInput, product: ProductPricing | undefined, promo: AppliedPromotion, problem: ProductProblem | null): PricedLine {
  const options = product ? pricedOptions(product, input.options) : [];
  const deltas = options.reduce((sum, o) => sum + o.priceDeltaRs, 0);
  const originalUnitPriceRs = product ? product.basePriceRs + deltas : 0;
  const unitPriceRs = promo ? promo.salePriceRs + deltas : originalUnitPriceRs;
  return {
    lineId: input.lineId ?? "",
    productId: input.productId,
    name: product?.name ?? { en: "", fr: null },
    options,
    cakeMessage: cleanText(input.cakeMessage) ?? null,
    quantity: input.quantity,
    unitPriceRs,
    originalUnitPriceRs,
    lineTotalRs: unitPriceRs * input.quantity,
    promotionId: promo?.promotionId ?? null,
    problem,
  };
}

/**
 * One line priced from a selection already checked: unit = (sale or base price) + the
 * options' deltas (quantity groups: unit delta x picked quantity), times the line quantity.
 * Throws LINE_NEGATIVE. A discount never changes option deltas. Money bounds are checked by
 * pricing.ts (server and product page).
 */
export function linePrice(product: ProductPricing, input: LineInput, promo: AppliedPromotion): PricedLine {
  const line = buildLine(input, product, promo, null);
  if (line.unitPriceRs < 0) throw new DomainError("LINE_NEGATIVE", "Line below Rs 0");
  return line;
}

/**
 * The picks still fit the product (no unknown group or choice, every required group has a
 * pick): what the basket page can tell from the cached menu. pricing.ts validateSelection is
 * the full rule (limits, ranges, duplicates) that the server applies.
 */
export function picksFit(product: ProductPricing, input: LineInput): boolean {
  const groups = product.optionGroups ?? [];
  const fits = input.options.every((pick) => {
    const group = groups.find((g) => g.id === pick.groupId);
    return group !== undefined && pick.choiceIds.every((id) => group.choices.some((c) => c.id === id));
  });
  return fits && groups.every((g) => !g.required || input.options.some((p) => p.groupId === g.id && (p.choiceIds.length > 0 || pickQuantity(p) > 0 || cleanText(p.text) !== undefined)));
}

export { checkoutTotals, deliveryFeeFor } from "./basket";

export interface BasketPricingOptions {
  fulfilment: Fulfilment | null;
  deliveryFeeRs: number;
  limits: PricingLimits;
  /** Mauritius date for the seasonal display rule; omitted = not checked. */
  today?: string;
  /** The promotion for a product (S-082); none by default. */
  promotionFor?: (product: ProductPricing) => AppliedPromotion;
  /** Whether the line's selection is valid for the product; default `picksFit` (pricing.ts passes the full rule). */
  fits?: (product: ProductPricing, line: LineInput, limits: PricingLimits) => boolean;
}

/** One basket line: priced, or marked with the problem that leaves it out. */
function basketLine(line: LineInput, product: ProductPricing | undefined, opts: BasketPricingOptions): PricedLine {
  const problem = productProblem(product, opts.today);
  if (problem || !product) return buildLine(line, product, null, problem ?? "hidden");
  const priced = buildLine(line, product, opts.promotionFor?.(product) ?? null, null);
  // A selection that no longer fits, or a line below Rs 0, is left out ("choose again").
  return (opts.fits ?? picksFit)(product, line, opts.limits) && priced.unitPriceRs >= 0 ? priced : { ...priced, problem: "options_changed" };
}

/**
 * Every line priced from the catalogue given (the server's, or the cached public menu for
 * display): problem lines (sold out, hidden, out of season, options no longer valid) are kept
 * with `problem` set and left out of the totals; delivery adds the fee.
 */
export function priceBasket(lines: readonly LineInput[], catalogue: ReadonlyMap<string, ProductPricing>, opts: BasketPricingOptions): PricedBasket {
  const priced = lines.map((line) => basketLine(line, catalogue.get(line.productId), opts));
  return { lines: priced, ...checkoutTotals(priced, opts.fulfilment, opts.deliveryFeeRs) };
}

/** The total the customer saw against the server's: PRICE_CHANGED (with the server basket) when they differ. */
export function reconcileTotal(displayedTotalRs: number, basket: PricedBasket): { ok: true } | { ok: false; code: "PRICE_CHANGED"; basket: PricedBasket } {
  return displayedTotalRs === basket.totalRs ? { ok: true } : { ok: false, code: "PRICE_CHANGED", basket };
}
