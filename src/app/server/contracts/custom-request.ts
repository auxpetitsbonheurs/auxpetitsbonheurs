// `site/custom-cake` and the quote actions (contracts.md v0.43, E-08). The request form posts
// flat fields like checkout: `contact.name`, `contact.phone`, `contact.email`, one window list
// per fulfilment (`windowId.delivery` / `windowId.pickup`), repeated `photoPaths`, and an
// optional `galleryPhotoId`. Every invalid field is listed at once by its form name (S-151 AC4).
import { z } from "zod";
import { OCCASIONS, QUOTE_LIMITS, REQUEST_LIMITS } from "~/domain/custom-request";
import { normalizePhone } from "~/domain/phone";
import { MAX_PHOTOS, UPLOAD_MAX_BYTES, UPLOAD_TYPES } from "~/domain/upload";
import { Contact, DeliveryDetail, MuDate, Rs, Uuid, Version, WindowId } from "./shared";

const optionalText = (max: number) => z.string().trim().max(max).optional();

export const CustomRequestBase = z.object({
  idempotencyKey: Uuid,
  uploadSessionId: Uuid,
  photoPaths: z.array(z.string().min(1).max(300)).max(MAX_PHOTOS),
  galleryPhotoId: Uuid.optional(),
  occasion: z.enum(OCCASIONS),
  date: MuDate,
  windowId: WindowId,
  servings: z.coerce.number().int().min(REQUEST_LIMITS.servingsMin).max(REQUEST_LIMITS.servingsMax),
  flavours: z.string().trim().min(1).max(REQUEST_LIMITS.shortTextMax),
  theme: optionalText(REQUEST_LIMITS.shortTextMax),
  cakeText: optionalText(REQUEST_LIMITS.cakeTextMax),
  budgetRs: Rs.optional(),
  details: optionalText(REQUEST_LIMITS.detailsMax),
  contact: Contact.omit({ note: true }).extend({
    phone: Contact.shape.phone.transform((value, ctx) => {
      const e164 = normalizePhone(value);
      if (e164 === null) ctx.addIssue({ code: "custom", message: "not a phone number" });
      return e164 ?? value;
    }),
  }),
  acceptPolicies: z.literal("on"),
  turnstileToken: z.string().max(2048).optional(),
});

export type CustomRequestInput = z.infer<typeof CustomRequestBase> & z.infer<typeof DeliveryDetail>;
export type ParsedCustomRequest = { ok: true; data: CustomRequestInput } | { ok: false; fields: string[] };

/** The form's fields that the page echoes back after a refusal (never the photos: their tiles keep them). */
export const REQUEST_ECHOED_FIELDS = [
  "occasion", "date", "windowId.delivery", "windowId.pickup", "servings", "flavours", "theme", "cakeText", "budgetRs", "details",
  "fulfilment", "address", "landmark", "contact.name", "contact.phone", "contact.email", "acceptPolicies",
] as const;

type FormValue = FormDataEntryValue | FormDataEntryValue[] | undefined;
export type RequestForm = Record<string, FormValue>;

const text = (form: RequestForm, key: string): string | undefined => {
  const value = form[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

const list = (form: RequestForm, key: string): string[] => {
  const value = form[key];
  const all = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return all.filter((v): v is string => typeof v === "string" && v !== "");
};

/** FormData -> a plain record where repeated fields (photoPaths) keep every value. */
export function requestFormRecord(form: FormData): RequestForm {
  const record: RequestForm = {};
  for (const key of new Set(form.keys())) {
    const values = form.getAll(key);
    record[key] = key === "photoPaths" ? values : values[0];
  }
  return record;
}

function shape(form: RequestForm) {
  const fulfilment = text(form, "fulfilment");
  return {
    idempotencyKey: text(form, "idempotencyKey"),
    uploadSessionId: text(form, "uploadSessionId"),
    photoPaths: list(form, "photoPaths"),
    galleryPhotoId: text(form, "galleryPhotoId"),
    occasion: text(form, "occasion"),
    date: text(form, "date"),
    windowId: fulfilment ? text(form, `windowId.${fulfilment}`) : undefined,
    servings: text(form, "servings"),
    flavours: text(form, "flavours"),
    theme: text(form, "theme"),
    cakeText: text(form, "cakeText"),
    budgetRs: text(form, "budgetRs"),
    details: text(form, "details"),
    fulfilment,
    address: text(form, "address"),
    landmark: text(form, "landmark"),
    contact: { name: text(form, "contact.name"), phone: text(form, "contact.phone"), email: text(form, "contact.email") },
    acceptPolicies: text(form, "acceptPolicies"),
    turnstileToken: text(form, "turnstileToken"),
  };
}

/** Field paths the form shows: photo problems are one `photos` field. */
const fieldName = (path: PropertyKey[]) => (path[0] === "photoPaths" || path[0] === "galleryPhotoId" ? "photos" : path.join("."));

export function parseCustomRequest(form: RequestForm): ParsedCustomRequest {
  const input = shape(form);
  const base = CustomRequestBase.safeParse(input);
  const delivery = DeliveryDetail.safeParse(input);
  if (base.success && delivery.success) return { ok: true, data: { ...base.data, ...delivery.data } };
  const fields = [
    ...(base.error?.issues ?? []).map((issue) => fieldName(issue.path)),
    ...(delivery.error?.issues ?? []).map((issue) => issue.path.join(".") || "fulfilment"),
  ];
  return { ok: false, fields: [...new Set(fields)] };
}

/** `requestUploadUrls`: one `type`/`size` pair per (already shrunk) photo, 1..5. */
export const RequestUploadInput = z.object({
  uploadSessionId: Uuid,
  files: z
    .array(z.object({ type: z.enum(UPLOAD_TYPES), size: z.number().int().min(1).max(UPLOAD_MAX_BYTES) }))
    .min(1)
    .max(MAX_PHOTOS),
  turnstileToken: z.string().max(2048).optional(),
});
export type RequestUploadInput = z.infer<typeof RequestUploadInput>;

/** `admin/order` sendQuote (also the re-quote while Quote sent). */
export const SendQuoteInput = z.object({
  version: Version,
  amountRs: z.coerce.number().int().min(QUOTE_LIMITS.amountMin).max(QUOTE_LIMITS.amountMax),
  note: z.string().trim().max(QUOTE_LIMITS.noteMax).optional(),
  expiresOn: MuDate,
});

/** `admin/order` decline of a request (optional reason). */
export const DeclineRequestInput = z.object({
  version: Version,
  reason: z.string().trim().max(QUOTE_LIMITS.declineReasonMax).optional(),
});

/** `site/tracking` acceptQuote / declineQuote. */
export const QuoteAnswerInput = z.object({ version: Version });
