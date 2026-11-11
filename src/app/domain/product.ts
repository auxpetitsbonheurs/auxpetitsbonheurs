// Product rules shared by the admin menu, the editor and their services (FR-061, FR-062).
// Pure: no I/O. Labels live in i18n under admin.menu.* and admin.product.*.

/** Menu groups, in the order the admin menu and the customer filters show them. */
export const PRODUCT_TYPES = ["cake", "cupcake_box", "dessert", "seasonal"] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const PRODUCT_STATUSES = ["available", "sold_out", "hidden"] as const;
export type ProductStatusValue = (typeof PRODUCT_STATUSES)[number];

/** Allergen chips the editor offers (data-model: `product.allergens` tags). */
export const ALLERGEN_TAGS = ["eggless", "nut_free", "gluten_free", "dairy_free"] as const;
export type AllergenTag = (typeof ALLERGEN_TAGS)[number];

/** Editor limits (spec "Edge Cases": names <= 120, descriptions <= 2000; notice 0-60). */
export const PRODUCT_NAME_MAX = 120;
export const PRODUCT_DESCRIPTION_MAX = 2000;
export const PRODUCT_CATEGORY_MAX = 60;
export const PRODUCT_SLUG_MAX = 80;
export const NOTICE_DAYS_MAX = 60;
export const PRICE_MAX_RS = 1_000_000;

/** `[a-z0-9-]`, no leading, trailing or double dash. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Web address from the English name: accents dropped ("Crème brûlée" -> "creme-brulee"),
 * anything else outside `[a-z0-9]` becomes a dash. A name with no letters or digits
 * (emoji only) gives "product".
 */
export function slugFromName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, PRODUCT_SLUG_MAX)
    .replace(/-+$/, "");
  return slug || "product";
}

/**
 * The seasonal tag of a product on `today` (Mauritius date): "scheduled" before its window
 * opens, "current" inside it (or a Seasonal-type product with no dates), "ended" after it.
 */
export type SeasonalTag = "current" | "scheduled" | "ended" | null;

export function seasonalTag(
  product: { type: string; seasonalStartsOn: string | null; seasonalEndsOn: string | null },
  today: string,
): SeasonalTag {
  const { seasonalStartsOn: starts, seasonalEndsOn: ends } = product;
  if (starts && ends) {
    if (today < starts) return "scheduled";
    return today > ends ? "ended" : "current";
  }
  return product.type === "seasonal" ? "current" : null;
}

/** A product can be offered (available or sold out) only with a photo; hidden is always allowed. */
export function statusNeedsPhoto(status: ProductStatusValue): boolean {
  return status !== "hidden";
}
