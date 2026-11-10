// Basket rules (checkout spec "Basket storage", FR-018). Pure: the cookie format and
// parsing live in app/server/basket.server.ts. Lines hold ids, choices, quantity and
// the cake message only, never prices (prices are always recomputed on the server).
import { DomainError } from "./errors";

/** Shared limits (contracts.md "Limits"); re-exported by app/server/contracts/shared.ts. */
export const BASKET_MAX_LINES = 10;
export const LINE_MAX_QUANTITY = 50;
export const LINE_MIN_QUANTITY = 1;

export interface OptionPick {
  groupId: string;
  choiceIds: string[];
  text?: string;
  quantity?: number;
}

export interface BasketLine {
  lineId: string;
  productId: string;
  options: OptionPick[];
  cakeMessage?: string;
  quantity: number;
}

export type NewBasketLine = Omit<BasketLine, "lineId">;

function configurationKey(line: NewBasketLine): string {
  const options = [...line.options]
    .map((o) => ({ ...o, choiceIds: [...o.choiceIds].sort() }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId));
  return JSON.stringify([line.productId, options, line.cakeMessage ?? ""]);
}

const capped = (quantity: number) => Math.min(quantity, LINE_MAX_QUANTITY);

/**
 * Adds `line`: an identical configuration (product, options, message) increases that
 * line's quantity (capped at 50); otherwise a new line. An 11th line is BASKET_FULL.
 * Returns a new array; `lines` is never modified.
 */
export function addLine(lines: readonly BasketLine[], line: NewBasketLine, newLineId: () => string): BasketLine[] {
  const key = configurationKey(line);
  const index = lines.findIndex((existing) => configurationKey(existing) === key);
  if (index >= 0) {
    return lines.map((existing, i) =>
      i === index ? { ...existing, quantity: capped(existing.quantity + line.quantity) } : existing,
    );
  }
  if (lines.length >= BASKET_MAX_LINES) {
    throw new DomainError("BASKET_FULL", `A basket holds at most ${BASKET_MAX_LINES} lines`);
  }
  return [...lines, { ...line, quantity: capped(line.quantity), lineId: newLineId() }];
}

/** Sets a line's quantity (1..50; anything else is VALIDATION_FAILED). Unknown line ids change nothing. */
export function setLineQuantity(lines: readonly BasketLine[], lineId: string, quantity: number): BasketLine[] {
  if (!Number.isInteger(quantity) || quantity < LINE_MIN_QUANTITY || quantity > LINE_MAX_QUANTITY) {
    throw new DomainError("VALIDATION_FAILED", "Quantity must be 1 to 50", { fields: ["quantity"] });
  }
  return lines.map((line) => (line.lineId === lineId ? { ...line, quantity } : line));
}

export function removeLine(lines: readonly BasketLine[], lineId: string): BasketLine[] {
  return lines.filter((line) => line.lineId !== lineId);
}

/** Items in the basket (sum of quantities), as the header count shows. */
export function basketItemCount(lines: readonly BasketLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}
