// The basket lives in the cookie `apb_basket` (ADR-0004; checkout spec "Basket storage"):
// the format, caps and encoding are shared with the browser store in
// app/domain/basket-cookie.ts. The cookie is not HttpOnly (the browser writes it); here it
// is untrusted input: every line is re-validated with the zod schema, invalid lines are
// dropped and an unparseable cookie is an empty basket (S-011 AC6).
import { type BasketLine, basketItemCount } from "~/domain/basket";
import { BASKET_COOKIE, decodeBasket } from "~/domain/basket-cookie";
import { readCookie } from "~/lib/cookies";
import { BasketLine as BasketLineSchema } from "./contracts/shared";

export { BASKET_COOKIE, basketCookie, clearBasketCookie, newLineId } from "~/domain/basket-cookie";

const zodLine = (item: unknown): BasketLine | undefined => {
  const parsed = BasketLineSchema.safeParse(item);
  return parsed.success ? parsed.data : undefined;
};

/** The visitor's basket lines (valid ones only, unique line ids, at most 10). */
export function readBasket(request: Request): BasketLine[] {
  return decodeBasket(readCookie(request, BASKET_COOKIE), zodLine);
}

/** Number of items (sum of line quantities) for the header basket link. */
export function readBasketCount(request: Request): number {
  return basketItemCount(readBasket(request));
}
