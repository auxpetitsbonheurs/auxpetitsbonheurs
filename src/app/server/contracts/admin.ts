// Admin app action inputs (contracts.md "Admin app").
import { z } from "zod";
import {
  ALLERGEN_TAGS,
  type AllergenTag,
  MIN_QUANTITY_MAX,
  MIN_QUANTITY_MIN,
  NOTICE_DAYS_MAX,
  PRICE_MAX_RS,
  PRODUCT_CATEGORY_MAX,
  PRODUCT_DESCRIPTION_MAX,
  PRODUCT_NAME_MAX,
  PRODUCT_SLUG_MAX,
  PRODUCT_STATUSES,
  PRODUCT_TYPES,
  type ProductStatusValue,
  SLUG_PATTERN,
} from "~/domain/product";
import { type OptionGroupInput, type OptionProblem, checkOptionGroups } from "~/domain/options";
import { Email, Uuid, Version } from "./shared";

/** `admin/login` signIn. Field problems are reported per field; the password is never echoed. */
export const SignInInput = z.object({
  email: Email,
  password: z.string().min(1).max(1024),
});

export type SignInField = "email" | "password";

/** Which fields are wrong, and how: an empty email reads differently from a malformed one. */
export function signInProblems(form: Record<string, unknown>): Partial<Record<SignInField, "missing" | "format">> {
  const email = typeof form.email === "string" ? form.email.trim() : "";
  const password = typeof form.password === "string" ? form.password : "";
  const problems: Partial<Record<SignInField, "missing" | "format">> = {};
  if (email === "") problems.email = "missing";
  else if (!SignInInput.shape.email.safeParse(email).success) problems.email = "format";
  if (password === "" || password.length > 1024) problems.password = "missing";
  return problems;
}

/** `admin/order` approve: the version the page loaded (FR-054). */
export const ApproveInput = z.object({
  intent: z.literal("approve"),
  version: Version,
});

export const OrderId = Uuid;

/** `admin/orders` paging (contracts.md "Pagination"): default 30, max 100, opaque cursor. */
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 100;

export function pageLimit(raw: string | null): number {
  const value = Number(raw);
  if (!raw || !Number.isInteger(value) || value < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(value, MAX_PAGE_SIZE);
}

/** Opaque cursor: base64url of the last order number shown. */
export function encodeCursor(number: number): string {
  return btoa(`n:${number}`).replace(/=+$/, "").replaceAll("+", "-").replaceAll("/", "_");
}

export function decodeCursor(raw: string | null): number | null {
  if (!raw || !/^[A-Za-z0-9_-]{1,40}$/.test(raw)) return null;
  try {
    const match = /^n:(\d{1,9})$/.exec(atob(raw.replaceAll("-", "+").replaceAll("_", "/")));
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** `admin/menu` row actions (S-043 setStatus, S-045 delete). */
export const MenuActionInput = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("setStatus"), id: Uuid, status: z.enum(PRODUCT_STATUSES) }),
  z.object({ intent: z.literal("delete"), id: Uuid }),
]);

// ---------------------------------------------------------------------------
// `admin/product` save (contracts.md `ProductInput`, S-046). The editor posts flat
// dotted names (`name.en`, `description.fr`, repeated `allergens`); `parseProductForm`
// checks each field and builds the nested ProductInput. Option groups (S-048) come as one
// JSON field `optionGroups` checked by domain/options (every problem keyed by its path); a
// form without it keeps the product's groups. The editor's photo list (S-047) is
// posted as one JSON field `photos` ([{ path, width, height }], in card order) with the
// `uploadSessionId` its uploads were issued under; a form without `photos` keeps the
// product's photos as they are.

const blankToUndefined = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());
const wholeNumber = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && /^\s*\d+\s*$/.test(value) ? Number(value) : value),
    z.number().int().min(min).max(max),
  );

/** Field -> schema. A field failing its schema gets that field's message (problem `invalid`). */
const PRODUCT_FIELDS = {
  "name.en": z.string().trim().min(1).max(PRODUCT_NAME_MAX),
  "name.fr": optionalText(PRODUCT_NAME_MAX),
  "description.en": optionalText(PRODUCT_DESCRIPTION_MAX),
  "description.fr": optionalText(PRODUCT_DESCRIPTION_MAX),
  basePriceRs: wholeNumber(0, PRICE_MAX_RS),
  noticeDays: z.preprocess(blankToUndefined, wholeNumber(0, NOTICE_DAYS_MAX).optional()),
  minQuantity: z.preprocess(blankToUndefined, wholeNumber(MIN_QUANTITY_MIN, MIN_QUANTITY_MAX).optional()),
  type: z.enum(PRODUCT_TYPES),
  category: optionalText(PRODUCT_CATEGORY_MAX),
  status: z.enum(PRODUCT_STATUSES),
  slug: z.preprocess(blankToUndefined, z.string().trim().max(PRODUCT_SLUG_MAX).regex(SLUG_PATTERN).optional()),
  allergens: z.array(z.enum(ALLERGEN_TAGS)).max(ALLERGEN_TAGS.length),
} as const;

/** One photo as posted: a path (kept or newly uploaded) and its pixel size. */
const PostedPhoto = z.object({
  path: z.string().min(1).max(300),
  width: z.number().int().min(1).max(10_000),
  height: z.number().int().min(1).max(10_000),
});
/** Up to 20 parse here so a sixth photo reaches the service and is refused as UPLOAD_REJECTED (AC4). */
const PostedPhotos = z.array(PostedPhoto).max(20);

function parseJsonField(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return Symbol("invalid");
  }
}

export type ProductField = keyof typeof PRODUCT_FIELDS | "photos" | "optionGroups";
/**
 * `missing` for an empty English name; `invalid` for anything else; `taken`/`photo`/`rejected`
 * come from the service; `none`/`too_many` for option groups and their choices.
 */
export type ProductProblem = "missing" | "invalid" | "taken" | "photo" | "rejected" | OptionProblem;
/** Field -> problem. Option group fields are paths such as `optionGroups.1.choices.0.name.en`. */
export type ProductProblems = Partial<Record<ProductField | "id", ProductProblem>> & Record<string, ProductProblem | undefined>;

export interface ProductInput {
  id?: string;
  slug?: string;
  type: (typeof PRODUCT_TYPES)[number];
  category: string | null;
  name: { en: string; fr: string | null };
  description: { en: string | null; fr: string | null };
  basePriceRs: number;
  allergens: AllergenTag[];
  noticeDays: number | null;
  /** Minimum units per basket line (dessert cups by 6); null = none. */
  minQuantity: number | null;
  status: ProductStatusValue;
  /** Absent: keep the product's option groups. Present: exactly these, in this order. */
  optionGroups?: OptionGroupInput[];
  /** Absent: keep the product's photos. Present: exactly these, first = card image. */
  photos?: { path: string; width: number; height: number }[];
  uploadSessionId?: string;
}

export type ProductFormResult =
  | { ok: true; input: ProductInput }
  | { ok: false; problems: ProductProblems };

/** Parses the editor's FormData. Every field is checked, so the page can mark all of them at once. */
export function parseProductForm(form: FormData): ProductFormResult {
  const raw = (name: string) => form.get(name) ?? "";
  const values: Record<string, unknown> = {};
  const problems: ProductProblems = {};
  for (const [field, schema] of Object.entries(PRODUCT_FIELDS) as [ProductField, z.ZodType][]) {
    const parsed = schema.safeParse(field === "allergens" ? form.getAll("allergens") : raw(field));
    if (parsed.success) values[field] = parsed.data;
    else problems[field] = field === "name.en" && String(raw(field)).trim() === "" ? "missing" : "invalid";
  }
  const id = blankToUndefined(raw("id"));
  if (id !== undefined && !Uuid.safeParse(id).success) problems.id = "invalid";
  const photos = form.has("photos") ? PostedPhotos.safeParse(parseJsonField(form.get("photos"))) : null;
  const uploadSession = Uuid.safeParse(raw("uploadSessionId"));
  if (photos && !photos.success) problems.photos = "invalid";
  const options = form.has("optionGroups") ? checkOptionGroups(parseJsonField(form.get("optionGroups"))) : null;
  if (options) Object.assign(problems, options.problems);
  if (Object.keys(problems).length > 0) return { ok: false, problems };
  const text = (field: ProductField) => (values[field] as string | undefined) ?? null;
  return {
    ok: true,
    input: {
      ...(id ? { id: id as string } : {}),
      ...(values.slug ? { slug: values.slug as string } : {}),
      type: values.type as ProductInput["type"],
      category: text("category"),
      name: { en: values["name.en"] as string, fr: text("name.fr") },
      description: { en: text("description.en"), fr: text("description.fr") },
      basePriceRs: values.basePriceRs as number,
      allergens: values.allergens as AllergenTag[],
      noticeDays: (values.noticeDays as number | undefined) ?? null,
      minQuantity: (values.minQuantity as number | undefined) ?? null,
      status: values.status as ProductStatusValue,
      ...(options ? { optionGroups: options.groups } : {}),
      ...(photos?.success ? { photos: photos.data } : {}),
      ...(uploadSession.success ? { uploadSessionId: uploadSession.data.toLowerCase() } : {}),
    },
  };
}
