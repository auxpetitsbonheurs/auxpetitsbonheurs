// Workshops (E-15; contracts.md "Workshops"). The registration form (`site/workshop`
// `register`) and the admin event editor (`admin/workshop` `save`) post flat fields; every
// invalid field is listed at once by its form name, like the custom cake form.
import { z } from "zod";
import { normalizePhone } from "~/domain/phone";
import { WORKSHOP_LIMITS as L, isTime } from "~/domain/workshop";
import { Contact, MuDate, Uuid, Version } from "./shared";

type FormValue = FormDataEntryValue | FormDataEntryValue[] | undefined;
export type FlatForm = Record<string, FormValue>;

const text = (form: FlatForm, key: string): string | undefined => {
  const value = form[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
};

/** FormData -> a plain record (first value of each key). */
export function flatForm(form: FormData): FlatForm {
  const record: FlatForm = {};
  for (const key of new Set(form.keys())) record[key] = form.get(key) ?? undefined;
  return record;
}

const PhoneE164 = Contact.shape.phone.transform((value, ctx) => {
  const e164 = normalizePhone(value);
  if (e164 === null) ctx.addIssue({ code: "custom", message: "not a phone number" });
  return e164 ?? value;
});

/**
 * `register`: contact, how many cakes and the cake for each (`cake.0` … `cake.<n-1>`), the
 * people's names, the explicit allergies choice (`none` or `yes` with a description: never
 * skipped by accident, Owner 2026-11-14), an optional message, Turnstile.
 */
export const RegistrationInput = z
  .object({
    idempotencyKey: Uuid,
    eventId: Uuid,
    contact: Contact.omit({ note: true }).extend({ phone: PhoneE164 }),
    cakes: z.coerce.number().int().min(1).max(L.cakesPerRegistrationMax),
    cakeChoices: z.array(z.string().min(1).max(40)),
    peopleNames: z.string().trim().max(L.peopleNamesMax).optional(),
    allergiesChoice: z.enum(["none", "yes"]),
    allergies: z.string().trim().max(L.allergiesMax).optional(),
    message: z.string().trim().max(L.messageMax).optional(),
    turnstileToken: z.string().max(2048).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.allergiesChoice === "yes" && !value.allergies) ctx.addIssue({ code: "custom", path: ["allergies"], message: "describe" });
    value.cakeChoices.forEach((choice, i) => {
      if (!choice) ctx.addIssue({ code: "custom", path: [`cake.${i}`], message: "choose" });
    });
  });
export type RegistrationInput = z.infer<typeof RegistrationInput>;

/** Fields echoed back after a refusal, so nothing typed is lost. */
export const REGISTRATION_ECHOED_FIELDS = ["contact.name", "contact.phone", "contact.email", "cakes", "peopleNames", "allergiesChoice", "allergies", "message"] as const;

function registrationShape(form: FlatForm) {
  const cakes = Number(text(form, "cakes") ?? "0");
  const count = Number.isInteger(cakes) && cakes > 0 ? Math.min(cakes, L.cakesPerRegistrationMax) : 0;
  return {
    idempotencyKey: text(form, "idempotencyKey"),
    eventId: text(form, "eventId"),
    contact: { name: text(form, "contact.name"), phone: text(form, "contact.phone"), email: text(form, "contact.email") },
    cakes: text(form, "cakes"),
    cakeChoices: Array.from({ length: count }, (_, i) => text(form, `cake.${i}`) ?? ""),
    peopleNames: text(form, "peopleNames"),
    allergiesChoice: text(form, "allergiesChoice"),
    allergies: text(form, "allergiesChoice") === "yes" ? text(form, "allergies") : undefined,
    message: text(form, "message"),
    turnstileToken: text(form, "turnstileToken"),
  };
}

const fieldName = (path: PropertyKey[]) => (path[0] === "cakeChoices" ? `cake.${String(path[1] ?? 0)}` : path.join("."));

export type Parsed<T> = { ok: true; data: T } | { ok: false; fields: string[] };

export function parseRegistration(form: FlatForm): Parsed<RegistrationInput> {
  const parsed = RegistrationInput.safeParse(registrationShape(form));
  if (parsed.success) return { ok: true, data: parsed.data };
  return { ok: false, fields: [...new Set(parsed.error.issues.map((issue) => fieldName(issue.path)))] };
}

const Time = z.string().refine(isTime);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || null);

/** `admin/workshop` `save`: the whole event. Options post as `option.<i>.id`, `.en`, `.fr`. */
export const WorkshopEventInput = z
  .object({
    id: Uuid.nullable(),
    version: Version.nullable(),
    titleEn: z.string().trim().min(1).max(L.titleMax),
    titleFr: optionalText(L.titleMax),
    descriptionEn: z.string().trim().max(L.descriptionMax).default(""),
    descriptionFr: optionalText(L.descriptionMax),
    photoPath: z.string().max(300).nullable(),
    eventOn: MuDate,
    startsAt: Time,
    endsAt: Time,
    address: z.string().trim().min(1).max(L.addressMax),
    mapUrl: z
      .string()
      .trim()
      .max(L.mapUrlMax)
      .refine((v) => v === "" || /^https:\/\/\S+$/.test(v))
      .optional()
      .transform((v) => v || null),
    priceRs: z.coerce.number().int().min(0).max(L.priceMax),
    capacity: z.coerce.number().int().min(L.capacityMin).max(L.capacityMax),
    options: z
      .array(z.object({ id: z.string().min(1).max(40), name: z.object({ en: z.string().trim().min(1).max(L.optionNameMax), fr: optionalText(L.optionNameMax) }) }))
      .min(L.optionsMin)
      .max(L.optionsMax),
  })
  .superRefine((value, ctx) => {
    if (value.endsAt <= value.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "after" });
  });
export type WorkshopEventInput = z.infer<typeof WorkshopEventInput>;

function eventShape(form: FlatForm) {
  const options: { id: string; name: { en: string | undefined; fr: string | undefined } }[] = [];
  for (let i = 0; i < L.optionsMax + 5; i++) {
    const en = text(form, `option.${i}.en`);
    const fr = text(form, `option.${i}.fr`);
    if (!en && !fr) continue;
    options.push({ id: text(form, `option.${i}.id`) ?? crypto.randomUUID().slice(0, 8), name: { en, fr } });
  }
  return {
    id: text(form, "id") ?? null,
    version: text(form, "version") ?? null,
    titleEn: text(form, "titleEn"),
    titleFr: text(form, "titleFr"),
    descriptionEn: text(form, "descriptionEn") ?? "",
    descriptionFr: text(form, "descriptionFr"),
    photoPath: text(form, "photoPath") ?? null,
    eventOn: text(form, "eventOn"),
    startsAt: text(form, "startsAt"),
    endsAt: text(form, "endsAt"),
    address: text(form, "address"),
    mapUrl: text(form, "mapUrl"),
    priceRs: text(form, "priceRs"),
    capacity: text(form, "capacity"),
    options,
  };
}

const eventField = (path: PropertyKey[]) => (path[0] === "options" ? "options" : String(path[0] ?? "form"));

export function parseWorkshopEvent(form: FlatForm): Parsed<WorkshopEventInput> {
  const shape = eventShape(form);
  const parsed = WorkshopEventInput.safeParse(shape);
  if (parsed.success) return { ok: true, data: parsed.data };
  const fields = parsed.error.issues.map((issue) => eventField(issue.path));
  // The refinement is skipped while other fields fail; the end-after-start problem is listed anyway.
  if (shape.startsAt && shape.endsAt && isTime(shape.startsAt) && isTime(shape.endsAt) && shape.endsAt <= shape.startsAt) fields.push("endsAt");
  return { ok: false, fields: [...new Set(fields)] };
}

/** `admin/workshop` publish / unpublish / complete: the version the page loaded. */
export const EventVersionInput = z.object({ version: Version });

/** `admin/workshop` cancelEvent: optional reason, shown to every registrant. */
export const CancelEventInput = z.object({ version: Version, reason: z.string().trim().max(L.cancelReasonMax).optional() });
