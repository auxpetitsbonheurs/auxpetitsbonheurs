// `admin/order-edit` save (contracts.md `admin/order-edit`, FR-053, S-122): the whole edited order
// as one JSON `payload` field (the line list is nested). `AdminLine` gains a third shape for the
// edit, a kept line `{ itemId, quantity }`: an existing item keeps the price it was ordered at
// (FR-017) and only its quantity changes; catalogue lines are priced now, free-text lines as
// entered. Shared with the manual order (E-07, `create`), which posts no kept lines.
import { z } from "zod";
import { BasketLine, Email, Fulfilment, MuDate, Phone, Rs, Uuid, Version, WindowId } from "./shared";

export const LINE_QUANTITY_MAX = 50;
export const EDIT_LINES_MAX = 30;

export const KeptLine = z.object({ itemId: Uuid, quantity: z.coerce.number().int().min(1).max(LINE_QUANTITY_MAX) });
export const FreeTextLine = z.object({
  freeText: z.object({ name: z.string().trim().min(1).max(120), priceRs: Rs, quantity: z.coerce.number().int().min(1).max(LINE_QUANTITY_MAX) }),
});
export const EditLine = z.union([KeptLine, FreeTextLine, BasketLine]);
export type EditLine = z.infer<typeof EditLine>;

export const AdminContact = z.object({
  name: z.string().trim().min(1).max(80),
  phone: Phone,
  email: z.union([Email, z.literal("").transform(() => undefined)]).optional(),
  note: z.string().trim().max(1000).optional(),
});

export const OrderFormInput = z
  .object({
    lines: z.array(EditLine).min(1).max(EDIT_LINES_MAX),
    date: MuDate,
    windowId: WindowId,
    fulfilment: Fulfilment,
    address: z.string().trim().max(300).optional(),
    landmark: z.string().trim().max(200).optional(),
    deliveryFeeRs: Rs,
    contact: AdminContact,
  })
  .superRefine((value, ctx) => {
    if (value.fulfilment === "delivery" && (value.address ?? "").length < 5) ctx.addIssue({ code: "custom", path: ["address"], message: "required" });
  });
export type OrderFormInput = z.infer<typeof OrderFormInput>;

export const OrderEditInput = z.intersection(
  OrderFormInput,
  z.object({
    version: Version,
    /** null clears a total set by hand. */
    overrideTotalRs: Rs.nullable(),
  }),
);
export type OrderEditInput = z.infer<typeof OrderEditInput>;

/** The field a problem belongs to, for the error summary ("lines.2.freeText.priceRs" → "lines"). */
export function problemField(path: readonly PropertyKey[]): string {
  const [first, second] = path;
  if (first === "contact" && typeof second === "string") return `contact.${second}`;
  return typeof first === "string" ? first : "form";
}
