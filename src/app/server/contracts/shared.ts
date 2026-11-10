// Shared zod schemas (contracts.md "Shared schemas"). Imported by route actions and
// services; views import the limits from ~/domain/basket (this folder is server-only).
import { z } from "zod";

export { BASKET_MAX_LINES, LINE_MAX_QUANTITY } from "~/domain/basket";

export const Locale = z.enum(["en", "fr"]);
export const Uuid = z.uuid();
export const MuDate = z.iso.date();
export const Rs = z.coerce.number().int().min(0).max(1_000_000);
/** Normalised to E.164 by domain/phone after parsing. */
export const Phone = z.string().trim().min(6).max(20);
export const Email = z.email().trim().toLowerCase().max(254);
export const Fulfilment = z.enum(["delivery", "pickup"]);
export const WindowId = z.string().min(1).max(40);
export const Quantity = z.coerce.number().int().min(1).max(50);
/** Optimistic concurrency token of an order or the settings row (FR-054). */
export const Version = z.coerce.number().int().min(1);

export const OptionPick = z.object({
  groupId: Uuid,
  choiceIds: z.array(Uuid).max(20).default([]),
  text: z.string().max(200).optional(),
  quantity: z.coerce.number().int().min(0).max(99).optional(),
});

export const BasketLine = z.object({
  lineId: z.string().min(1).max(16),
  productId: Uuid,
  options: z.array(OptionPick).max(20),
  cakeMessage: z.string().max(200).optional(),
  quantity: Quantity,
});

export const Contact = z.object({
  name: z.string().trim().min(1).max(80),
  phone: Phone,
  email: Email,
  note: z.string().trim().max(1000).optional(),
});

export const DeliveryDetail = z.discriminatedUnion("fulfilment", [
  z.object({ fulfilment: z.literal("pickup") }),
  z.object({
    fulfilment: z.literal("delivery"),
    address: z.string().trim().min(5).max(300),
    landmark: z.string().trim().max(200).optional(),
  }),
]);
