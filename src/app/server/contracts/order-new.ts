// `admin/order-new` (contracts.md, FR-055..057, E-07 S-131..S-135): the manual order `create`
// (one JSON `payload` field, the shared order form's fields plus its own) and `findCustomer`.
// Lines are catalogue or free-text only (no kept lines: nothing exists yet), at most 20.
import { z } from "zod";
import { FreeTextLine, OrderFormInput } from "./order-edit";
import { BasketLine, Email, Locale, Uuid } from "./shared";

export const MANUAL_LINES_MAX = 20;
export const ADMIN_NOTE_MAX = 2000;
/** The admin horizon forward (owner Q9: past dates are allowed, the future up to a year). */
export const MANUAL_DATE_HORIZON_DAYS = 365;

export const ManualLine = z.union([FreeTextLine, BasketLine]);

export const ManualOrderInput = z.intersection(
  OrderFormInput,
  z.object({
    idempotencyKey: Uuid,
    lines: z.array(ManualLine).min(1).max(MANUAL_LINES_MAX),
    locale: Locale,
    adminNote: z.string().trim().max(ADMIN_NOTE_MAX).optional(),
    paid: z.boolean(),
  }),
);
export type ManualOrderInput = z.infer<typeof ManualOrderInput>;

/** `findCustomer { phone?, email? }`: at least one (S-133 AC7). Values are looked up, never stored. */
export const FindCustomerInput = z
  .object({
    phone: z.string().trim().max(20).optional().transform((v) => v || undefined),
    email: z.union([Email, z.literal("").transform(() => undefined)]).optional(),
  })
  .refine((value) => value.phone !== undefined || value.email !== undefined, { message: "required", path: ["phone"] });
export type FindCustomerInput = z.infer<typeof FindCustomerInput>;
