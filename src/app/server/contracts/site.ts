// Customer-site action inputs (contracts.md "Customer site").
import { z } from "zod";
import { BasketLine } from "./shared";

/** `site/product` addToBasket: BasketLine minus lineId; the minimal slice posts no options. */
export const AddToBasketInput = BasketLine.omit({ lineId: true }).extend({
  intent: z.literal("addToBasket"),
  options: BasketLine.shape.options.default([]),
  quantity: BasketLine.shape.quantity.default(1),
});

/** `site/basket` updateLine (quantity 1..50, else VALIDATION_FAILED fields.quantity). */
export const UpdateLineInput = z.object({
  intent: z.literal("updateLine"),
  lineId: BasketLine.shape.lineId,
  quantity: BasketLine.shape.quantity,
});

/** `site/basket` removeLine. */
export const RemoveLineInput = z.object({
  intent: z.literal("removeLine"),
  lineId: BasketLine.shape.lineId,
});
