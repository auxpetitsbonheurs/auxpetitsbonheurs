// `admin/promotion` save and `admin/promotions` setActive / delete (S-052, S-053, FR-063):
// the posted form checked field by field. Dates are Mauritius wall time
// ("YYYY-MM-DDTHH:mm", a datetime-local value); discounts apply to the base price only.
import { z } from "zod";
import { PRODUCT_TYPES, type ProductType } from "~/domain/product";
import { muDateTimeToInstant } from "~/domain/time";
import { Uuid } from "./shared";

export const PROMO_TITLE_MAX = 80;
export const PROMO_TEXT_MAX = 200;
export const PROMO_PLACEMENTS = ["banner", "card", "both"] as const;
export const PROMO_LINK_KINDS = ["none", "product", "category", "custom_request"] as const;
export const DISCOUNT_CHOICES = ["none", "percent", "sale_price"] as const;

export type PromotionProblem = "missing" | "tooLong" | "format" | "order" | "range";

export interface PromotionDiscountInput {
  productId: string;
  kind: "percent" | "sale_price";
  percentOff: number | null;
  salePriceRs: number | null;
}

export interface PromotionInput {
  id: string | null;
  title: { en: string; fr: string | null };
  text: { en: string | null; fr: string | null };
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  placement: (typeof PROMO_PLACEMENTS)[number];
  link: { kind: (typeof PROMO_LINK_KINDS)[number]; productId: string | null; category: ProductType | null };
  discounts: PromotionDiscountInput[];
}

type Problems = Record<string, PromotionProblem>;
type Parsed = { ok: true; input: PromotionInput } | { ok: false; problems: Problems };

const text = (form: FormData, name: string) => {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
};

function checkText(problems: Problems, field: string, value: string, max: number, required: boolean): string | null {
  if (value === "") {
    if (required) problems[field] = "missing";
    return null;
  }
  if ([...value].length > max) problems[field] = "tooLong";
  return value;
}

function checkInstant(problems: Problems, field: string, value: string): Date | null {
  if (value === "") return (problems[field] = "missing"), null;
  try {
    return muDateTimeToInstant(value);
  } catch {
    problems[field] = "format";
    return null;
  }
}

const WHOLE = /^\d{1,7}$/;

/** One product's row: "none" (no offer), a percent 1..99, or a whole-rupee sale price >= 0. */
function checkDiscount(problems: Problems, form: FormData, productId: string): PromotionDiscountInput | null {
  const kind = text(form, `discount.${productId}`);
  if (kind === "" || kind === "none") return null;
  const field = `discounts.${productId}`;
  const amount = text(form, `amount.${productId}`);
  if (kind !== "percent" && kind !== "sale_price") return (problems[field] = "format"), null;
  if (amount === "") return (problems[field] = "missing"), null;
  if (!WHOLE.test(amount)) return (problems[field] = "format"), null;
  const value = Number(amount);
  if (kind === "percent") {
    if (value < 1 || value > 99) return (problems[field] = "range"), null;
    return { productId, kind, percentOff: value, salePriceRs: null };
  }
  return { productId, kind, percentOff: null, salePriceRs: value };
}

function checkLink(problems: Problems, form: FormData, productIds: ReadonlySet<string>): PromotionInput["link"] {
  const kind = (PROMO_LINK_KINDS as readonly string[]).includes(text(form, "linkKind")) ? (text(form, "linkKind") as PromotionInput["link"]["kind"]) : "none";
  if (kind === "product") {
    const productId = text(form, "linkProductId");
    if (!productIds.has(productId)) problems.linkProductId = "missing";
    return { kind, productId: productId || null, category: null };
  }
  if (kind === "category") {
    const category = text(form, "linkCategory");
    if (!(PRODUCT_TYPES as readonly string[]).includes(category)) problems.linkCategory = "missing";
    return { kind, productId: null, category: (category || null) as ProductType | null };
  }
  return { kind, productId: null, category: null };
}

/**
 * Parses the editor's form against the products that exist (`productIds`). Every problem is
 * reported at once; field keys match the form (`title.en`, `endsAt`, `discounts.<productId>`).
 */
export function parsePromotionForm(form: FormData, productIds: ReadonlySet<string>): Parsed {
  const problems: Problems = {};
  const rawId = text(form, "id");
  const id = rawId === "" ? null : Uuid.safeParse(rawId).success ? rawId : ((problems.id = "format"), null);
  const titleEn = checkText(problems, "title.en", text(form, "title.en"), PROMO_TITLE_MAX, true);
  const titleFr = checkText(problems, "title.fr", text(form, "title.fr"), PROMO_TITLE_MAX, false);
  const textEn = checkText(problems, "text.en", text(form, "text.en"), PROMO_TEXT_MAX, false);
  const textFr = checkText(problems, "text.fr", text(form, "text.fr"), PROMO_TEXT_MAX, false);
  const startsAt = checkInstant(problems, "startsAt", text(form, "startsAt"));
  const endsAt = checkInstant(problems, "endsAt", text(form, "endsAt"));
  if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) problems.endsAt = "order";
  const placementRaw = text(form, "placement");
  const placement = (PROMO_PLACEMENTS as readonly string[]).includes(placementRaw) ? (placementRaw as PromotionInput["placement"]) : ((problems.placement = "missing"), "both");
  const link = checkLink(problems, form, productIds);
  const discounts = [...productIds].flatMap((productId) => checkDiscount(problems, form, productId) ?? []);
  if (Object.keys(problems).length > 0 || !titleEn || !startsAt || !endsAt) return { ok: false, problems };
  return {
    ok: true,
    input: { id, title: { en: titleEn, fr: titleFr }, text: { en: textEn, fr: textFr }, startsAt, endsAt, active: form.get("active") === "on", placement, link, discounts },
  };
}

export const PromotionActiveInput = z.object({ id: Uuid, active: z.enum(["true", "false"]).transform((v) => v === "true") });
export const PromotionIdInput = z.object({ id: Uuid });
