// Customer-site action inputs (contracts.md "Customer site").
import { z } from "zod";
import { normalizePhone } from "~/domain/phone";
import { BasketLine, Contact, DeliveryDetail, MuDate, Phone, Rs, Uuid, WindowId } from "./shared";

/** `site/product` addToBasket: BasketLine minus lineId (no price field: any posted price is ignored). */
export const AddToBasketInput = BasketLine.omit({ lineId: true }).extend({
  intent: z.literal("addToBasket"),
  options: BasketLine.shape.options.default([]),
  quantity: BasketLine.shape.quantity.default(1),
});

/**
 * The product page form as `AddToBasketInput` fields (S-066). The form posts one field per
 * group: `option.<groupId>` (the chosen choice id, repeated for pick-several),
 * `optionQty.<groupId>` (quantity groups) and `optionText.<groupId>` (text groups), plus
 * `cakeMessage` and `quantity`. Unknown fields (a forged price) are dropped here.
 */
export function addToBasketFields(form: FormData): Record<string, unknown> {
  const picks = new Map<string, { groupId: string; choiceIds: string[]; text?: string; quantity?: string }>();
  const pickFor = (groupId: string) => picks.get(groupId) ?? picks.set(groupId, { groupId, choiceIds: [] }).get(groupId)!;
  for (const [key, value] of form) {
    if (typeof value !== "string") continue;
    const [kind, groupId] = key.split(/\.(.*)/s, 2) as [string, string | undefined];
    if (!groupId) continue;
    if (kind === "option" && value !== "") pickFor(groupId).choiceIds.push(value);
    else if (kind === "optionQty") pickFor(groupId).quantity = value;
    else if (kind === "optionText") pickFor(groupId).text = value;
  }
  const text = (key: string) => (typeof form.get(key) === "string" ? (form.get(key) as string) : undefined);
  const cakeMessage = text("cakeMessage");
  return {
    intent: text("intent"),
    productId: text("productId"),
    quantity: text("quantity"),
    options: [...picks.values()],
    ...(cakeMessage ? { cakeMessage } : {}),
  };
}

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

/**
 * `site/basket` placeOrder (contracts.md). The form posts flat fields: `contact.name`,
 * `contact.phone`, `contact.email`, `contact.note`, and one window list per fulfilment
 * (`windowId.delivery` / `windowId.pickup`) so a hidden list never submits a choice, and
 * `displayedTotalRs.delivery` / `.pickup` when the client cannot send a single total.
 * The phone is normalised to E.164 by domain/phone. Turnstile arrives with E-05.
 */
export const PlaceOrderBase = z.object({
  idempotencyKey: Uuid,
  displayedTotalRs: Rs,
  date: MuDate,
  windowId: WindowId,
  contact: Contact.extend({
    phone: Phone.transform((value, ctx) => {
      const e164 = normalizePhone(value);
      if (e164 === null) ctx.addIssue({ code: "custom", message: "not a phone number" });
      return e164 ?? value;
    }),
  }),
  acceptPolicies: z.literal("on"),
  turnstileToken: z.string().max(2048).optional(),
});

export type PlaceOrderInput = z.infer<typeof PlaceOrderBase> & z.infer<typeof DeliveryDetail>;

export type ParsedPlaceOrder = { ok: true; data: PlaceOrderInput } | { ok: false; fields: string[] };

const text = (form: Record<string, unknown>, key: string) => {
  const value = form[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

function placeOrderShape(form: Record<string, unknown>) {
  const fulfilment = text(form, "fulfilment");
  return {
    idempotencyKey: text(form, "idempotencyKey"),
    // Without JavaScript the form posts one total per fulfilment (the page cannot know the
    // choice yet); the one matching `fulfilment` is the total the customer was shown.
    displayedTotalRs: text(form, "displayedTotalRs") ?? (fulfilment ? text(form, `displayedTotalRs.${fulfilment}`) : undefined),
    date: text(form, "date"),
    windowId: fulfilment ? text(form, `windowId.${fulfilment}`) : undefined,
    fulfilment,
    address: text(form, "address"),
    landmark: text(form, "landmark"),
    contact: {
      name: text(form, "contact.name"),
      phone: text(form, "contact.phone"),
      email: text(form, "contact.email"),
      note: text(form, "contact.note"),
    },
    acceptPolicies: text(form, "acceptPolicies"),
    turnstileToken: text(form, "turnstileToken"),
  };
}

/** Parses the posted form; on failure lists every invalid field by its form name. */
export function parsePlaceOrder(form: Record<string, unknown>): ParsedPlaceOrder {
  const shape = placeOrderShape(form);
  const base = PlaceOrderBase.safeParse(shape);
  const delivery = DeliveryDetail.safeParse(shape);
  if (base.success && delivery.success) return { ok: true, data: { ...base.data, ...delivery.data } };
  const fields = [
    ...(base.error?.issues ?? []).map((issue) => issue.path.join(".")),
    // A missing or unknown discriminator is reported at the root of the union.
    ...(delivery.error?.issues ?? []).map((issue) => issue.path.join(".") || "fulfilment"),
  ];
  return { ok: false, fields: [...new Set(fields)] };
}
