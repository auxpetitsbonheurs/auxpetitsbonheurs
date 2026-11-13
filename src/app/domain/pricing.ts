// Pricing rules (pricing-availability-promotions spec, S-081): the server is the authority
// (placeOrder, addToBasket); the browser runs the same functions for the live price. A price
// is never read from the client: `LineInput` has no price field (FR-011). This module adds
// the strict selection rules (every issue at once, grapheme-cluster limits) to the core in
// pricing-core.ts, which the basket page uses alone. Pure: no db, react, router, network or clock.
import type { NewBasketLine, OptionPick } from "./basket";
import { DomainError } from "./errors";
import {
  type AppliedPromotion,
  type BasketPricingOptions,
  type LineInput,
  type PricedBasket,
  type PricedLine,
  type PricingGroup,
  type PricingLimits,
  type ProductPricing,
  LINE_QUANTITY_MAX,
  MONEY_MAX_RS,
  PICK_QUANTITY_MAX,
  cleanText,
  linePrice,
  pickQuantity,
  priceBasket as priceBasketWith,
  quantityChoice,
} from "./pricing-core";

export * from "./pricing-core";

export type SelectionIssueCode = "quantity" | "below_min" | "required" | "too_many" | "unknown_choice" | "duplicate" | "quantity_range" | "too_long";

/** One problem with a selection. `field` is `quantity`, `cakeMessage` or `options.<groupId>`. */
export interface SelectionIssue {
  field: string;
  code: SelectionIssueCode;
  groupId?: string;
  /** The limit that was passed (`too_long`, `below_min`, `quantity_range`). */
  limit?: number;
}

let segmenter: Intl.Segmenter | null | undefined;

/** User-perceived characters after NFC (an emoji or "é" in any form counts 1). */
export function graphemeLength(value: string): number {
  const text = value.normalize("NFC");
  if (segmenter === undefined) segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  if (!segmenter) return [...text].length;
  let count = 0;
  for (const _ of segmenter.segment(text)) count += 1;
  return count;
}

function quantityIssues(product: ProductPricing, quantity: unknown, issues: SelectionIssue[]) {
  if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > LINE_QUANTITY_MAX) {
    issues.push({ field: "quantity", code: "quantity" });
  } else if (product.minQuantity && quantity < product.minQuantity) {
    issues.push({ field: "quantity", code: "below_min", limit: product.minQuantity });
  }
}

function choiceIssues(group: PricingGroup, pick: OptionPick, field: string): SelectionIssue[] {
  const known = new Set(group.kind === "text" ? [] : group.choices.map((c) => c.id));
  const issues: SelectionIssue[] = [];
  if (pick.choiceIds.some((id) => !known.has(id))) issues.push({ field, code: "unknown_choice", groupId: group.id });
  if (new Set(pick.choiceIds).size !== pick.choiceIds.length) issues.push({ field, code: "duplicate", groupId: group.id });
  const most = group.kind === "multiple" ? Infinity : 1;
  if (new Set(pick.choiceIds).size > most) issues.push({ field, code: "too_many", groupId: group.id });
  return issues;
}

function pickIssues(group: PricingGroup, pick: OptionPick, limits: PricingLimits): SelectionIssue[] {
  const field = `options.${group.id}`;
  const issues = choiceIssues(group, pick, field);
  if (group.kind === "quantity") {
    const quantity = pickQuantity(pick);
    const min = group.quantityMin ?? 0;
    const max = group.quantityMax ?? PICK_QUANTITY_MAX;
    const counted = quantity !== 0 || group.required;
    if (!Number.isInteger(quantity) || quantity < 0 || (counted && (quantity < min || quantity > max))) issues.push({ field, code: "quantity_range", groupId: group.id, limit: max });
    // Units of what? With several choices and none named, the pick is incomplete.
    else if (quantity > 0 && pick.choiceIds.length === 0 && !quantityChoice(group, pick)) issues.push({ field, code: "required", groupId: group.id });
  }
  if (group.kind === "text" && pick.text !== undefined) {
    const max = group.textMaxLength ?? limits.cakeMessageMax;
    const text = cleanText(pick.text);
    if (text && graphemeLength(text) > max) issues.push({ field, code: "too_long", groupId: group.id, limit: max });
  }
  return issues;
}

/** True when a required group has what it needs (checked after the pick's own issues). */
function satisfied(group: PricingGroup, pick: OptionPick | undefined): boolean {
  if (!pick) return false;
  if (group.kind === "text") return cleanText(pick.text) !== undefined;
  if (group.kind === "quantity") return pickQuantity(pick) >= 1 && quantityChoice(group, pick) !== undefined;
  return pick.choiceIds.length > 0;
}

/**
 * Every problem with `input` for `product` (never only the first): quantity (1..50 and the
 * product minimum), each pick against its group, required groups, and the cake message
 * (grapheme clusters after NFC and trimming; over the limit is refused, never truncated).
 */
export function validateSelection(product: ProductPricing, input: LineInput, limits: PricingLimits): SelectionIssue[] {
  const issues: SelectionIssue[] = [];
  quantityIssues(product, input.quantity, issues);
  const groups = new Map((product.optionGroups ?? []).map((g) => [g.id, g]));
  const seen = new Set<string>();
  for (const pick of input.options) {
    const group = groups.get(pick.groupId);
    const field = `options.${pick.groupId}`;
    if (!group) issues.push({ field, code: "unknown_choice", groupId: pick.groupId });
    else if (seen.has(group.id)) issues.push({ field, code: "duplicate", groupId: group.id });
    else {
      seen.add(group.id);
      issues.push(...pickIssues(group, pick, limits));
    }
  }
  for (const group of groups.values()) {
    const pick = input.options.find((o) => o.groupId === group.id);
    const flagged = issues.some((i) => i.groupId === group.id);
    if (group.required && !flagged && !satisfied(group, pick)) issues.push({ field: `options.${group.id}`, code: "required", groupId: group.id });
  }
  const message = cleanText(input.cakeMessage);
  if (message && graphemeLength(message) > limits.cakeMessageMax) issues.push({ field: "cakeMessage", code: "too_long", limit: limits.cakeMessageMax });
  return issues;
}

function assertMoney(value: number, what: string, allowNegative = false) {
  if (!Number.isInteger(value) || Math.abs(value) > MONEY_MAX_RS || (!allowNegative && value < 0)) {
    throw new DomainError("INVALID_MONEY", `${what} is not a whole rupee amount within bounds`);
  }
}

/** INVALID_MONEY for a base price or a choice's delta outside whole rupees 0..1,000,000 (deltas may be negative). */
function assertProductMoney(product: ProductPricing) {
  assertMoney(product.basePriceRs, "base price");
  for (const group of product.optionGroups ?? []) for (const choice of group.choices) assertMoney(choice.priceDeltaRs, "price change", true);
}

/**
 * One line priced with the full rules: throws SELECTION_INVALID (with every `issue`),
 * LINE_NEGATIVE or INVALID_MONEY.
 */
export function priceLine(product: ProductPricing, input: LineInput, promo: AppliedPromotion, limits: PricingLimits): PricedLine {
  assertProductMoney(product);
  if (promo) assertMoney(promo.salePriceRs, "sale price");
  const issues = validateSelection(product, input, limits);
  if (issues.length > 0) throw new DomainError("SELECTION_INVALID", "The selection is not valid for this product", { issues });
  return linePrice(product, input, promo);
}

/** The basket priced with the full rules (server, placeOrder): a line with any selection issue is `options_changed`. */
export function priceBasket(lines: readonly LineInput[], catalogue: ReadonlyMap<string, ProductPricing>, opts: BasketPricingOptions): PricedBasket {
  const fits = (product: ProductPricing, line: LineInput, limits: PricingLimits) => {
    assertProductMoney(product);
    return validateSelection(product, line, limits).length === 0;
  };
  return priceBasketWith(lines, catalogue, { ...opts, fits });
}

/**
 * The line as the basket stores it: picks in the product's group order with sorted choice
 * ids, texts cleaned (NFC, trimmed), empty picks and a blank message dropped, and a quantity
 * group's only choice filled in. The browser and the server store the same configuration, so
 * an identical one merges (S-066 AC6).
 */
export function canonicalLine(product: ProductPricing, line: LineInput): NewBasketLine {
  const options: OptionPick[] = [];
  for (const group of product.optionGroups ?? []) {
    const pick = line.options.find((p) => p.groupId === group.id);
    if (!pick) continue;
    if (group.kind === "text") {
      const text = cleanText(pick.text);
      if (text) options.push({ groupId: group.id, choiceIds: [], text });
    } else if (group.kind === "quantity") {
      const choice = quantityChoice(group, pick);
      if (pickQuantity(pick) > 0) options.push({ groupId: group.id, choiceIds: choice ? [choice.id] : [...pick.choiceIds], quantity: pickQuantity(pick) });
    } else if (pick.choiceIds.length > 0) options.push({ groupId: group.id, choiceIds: [...pick.choiceIds].sort() });
  }
  const unknown = line.options.filter((p) => !(product.optionGroups ?? []).some((g) => g.id === p.groupId));
  const message = cleanText(line.cakeMessage);
  return { productId: line.productId, options: [...options, ...unknown], ...(message ? { cakeMessage: message } : {}), quantity: line.quantity };
}

// ---------------------------------------------------------------------------
// Option groups (S-048). The editor warns, the order step decides (line total >= 0).

export { type PricedOptionGroup, fromPriceRs, lowestOptionPrice, optionsCanGoBelowZero } from "./option-prices";

/**
 * A customer's text for a text group (FR-008): `missing` when required and blank, `too_long`
 * over the group's limit or, when blank, the Settings cake message length (grapheme clusters).
 */
export function textOptionProblem(text: string | undefined, group: { required: boolean; textMaxLength: number | null }, settingsMax: number): "missing" | "too_long" | null {
  const value = cleanText(text);
  if (value === undefined) return group.required ? "missing" : null;
  return graphemeLength(value) > (group.textMaxLength ?? settingsMax) ? "too_long" : null;
}
