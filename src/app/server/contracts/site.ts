// Customer-site action inputs (contracts.md "Customer site").
import { z } from "zod";
import { BasketLine } from "./shared";

/** `site/product` addToBasket: BasketLine minus lineId; the minimal slice posts no options. */
export const AddToBasketInput = BasketLine.omit({ lineId: true }).extend({
  intent: z.literal("addToBasket"),
  options: BasketLine.shape.options.default([]),
  quantity: BasketLine.shape.quantity.default(1),
});
