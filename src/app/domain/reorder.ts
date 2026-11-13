// Reorder (E-11 S-214, FR-037; contracts.md `account/orders` reorder). A past order's items go
// back into the basket with the same options, at TODAY's prices (the basket always prices from the
// current menu, so an ended promotion simply gives the full price, AC2). A line is skipped, with a
// reason, when it cannot be ordered today: the product is gone or was a free-text manual line
// (`free_text`), hidden, sold out, out of season, an option choice no longer exists
// (`option_removed`), or the basket is full (`basket_full`, AC6; never a BASKET_FULL error).
// Pure: the caller passes the pricing of one candidate line against today's menu.
import { DomainError } from "./errors";
import { type BasketLine, type NewBasketLine, type OptionPick, addLine } from "./basket";
import type { LocalizedName, ProductProblem } from "./pricing-core";

/** What reorder reads of a stored option (`order_item.options`, a PricedOption copy). */
export interface StoredOption {
  groupId: string;
  choiceId?: string | null;
  text?: string;
  quantity?: number;
}

export type SkipReason = "sold_out" | "hidden" | "out_of_season" | "option_removed" | "free_text" | "basket_full";

export interface ReorderItem {
  productId: string | null;
  name: LocalizedName;
  options: StoredOption[];
  cakeMessage: string | null;
  quantity: number;
}

export interface Skipped {
  name: LocalizedName;
  reason: SkipReason;
}

/** The basket line an order item stands for: its options regrouped by group (choices, text, quantity). */
export function lineFromItem(item: ReorderItem & { productId: string }): NewBasketLine {
  const groups = new Map<string, OptionPick>();
  for (const option of item.options) {
    const pick = groups.get(option.groupId) ?? { groupId: option.groupId, choiceIds: [] };
    if (option.choiceId) pick.choiceIds.push(option.choiceId);
    if (option.text !== undefined) pick.text = option.text;
    if (option.quantity !== undefined) pick.quantity = option.quantity;
    groups.set(option.groupId, pick);
  }
  return {
    productId: item.productId,
    options: [...groups.values()],
    ...(item.cakeMessage ? { cakeMessage: item.cakeMessage } : {}),
    quantity: item.quantity,
  };
}

const REASON: Record<ProductProblem, SkipReason> = { sold_out: "sold_out", hidden: "hidden", out_of_season: "out_of_season", options_changed: "option_removed" };

/**
 * The basket after adding the order's items to `existing`, and what was skipped and why. When
 * nothing can be added the basket is `existing` unchanged (AC4).
 */
export function reorderInto(
  existing: readonly BasketLine[],
  items: readonly ReorderItem[],
  problemOf: (line: NewBasketLine) => ProductProblem | null,
  newLineId: () => string,
): { lines: BasketLine[]; skipped: Skipped[]; added: number } {
  let lines: BasketLine[] = [...existing];
  const skipped: Skipped[] = [];
  let added = 0;
  for (const item of items) {
    if (!item.productId) {
      skipped.push({ name: item.name, reason: "free_text" });
      continue;
    }
    const line = lineFromItem({ ...item, productId: item.productId });
    const problem = problemOf(line);
    if (problem) {
      skipped.push({ name: item.name, reason: REASON[problem] });
      continue;
    }
    try {
      lines = addLine(lines, line, newLineId);
      added += 1;
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "BASKET_FULL") throw error;
      skipped.push({ name: item.name, reason: "basket_full" });
    }
  }
  return { lines, skipped, added };
}
