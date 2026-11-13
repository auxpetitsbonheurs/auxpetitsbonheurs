// Catalogue reads for the customer site (S-011). Status rules (hidden = 404, sold out
// = shown but not addable) are applied by callers via domain/pricing productProblem.
import { asc, eq, getTableName, inArray, ne, sql } from "drizzle-orm";
import { optionChoice, optionGroup, product, productPhoto, productSlugHistory } from "~/db/schema";
import type { Database } from "~/server/db.server";

export type ProductStatus = (typeof product.$inferSelect)["status"];

export interface Localized {
  en: string;
  fr: string | null;
}

export interface PhotoRecord {
  storagePath: string;
  width: number;
  height: number;
  /** Widths of the stored smaller copies (S-276); absent in fixtures and old cached copies. */
  variantWidths?: number[];
}

export interface ProductRecord {
  id: string;
  slug: string;
  type: (typeof product.$inferSelect)["type"];
  status: ProductStatus;
  name: Localized;
  description: Localized | null;
  allergens: string[];
  basePriceRs: number;
  minQuantity: number | null;
  photos: PhotoRecord[];
}

/**
 * The product's photos in slot order, aggregated in the same statement: every query is a
 * full round trip from the Worker to Supabase, so rows and photos come back together.
 */
// Columns are written table-qualified: drizzle would print bare names, and a bare "id"
// inside the subquery would mean product_photo.id.
const photosJson = sql<PhotoRecord[] | string>`coalesce((
  select json_agg(json_build_object('storagePath', pp.storage_path, 'width', pp.width, 'height', pp.height, 'variantWidths', pp.variant_widths) order by pp.sort_order)
  from ${productPhoto} pp where pp.product_id = ${sql.raw(`"${getTableName(product)}"."id"`)}
), '[]'::json)`;

const columns = {
  id: product.id,
  slug: product.slug,
  type: product.type,
  status: product.status,
  nameEn: product.nameEn,
  nameFr: product.nameFr,
  descriptionEn: product.descriptionEn,
  descriptionFr: product.descriptionFr,
  allergens: product.allergens,
  basePriceRs: product.basePriceRs,
  minQuantity: product.minQuantity,
  photos: photosJson,
};

const selectProducts = (db: Database) => db.select(columns).from(product);
type Row = Awaited<ReturnType<typeof selectProducts>>[number];

/** Drivers differ: postgres.js parses json, others may hand back the text. */
const parsePhotos = (value: Row["photos"]): PhotoRecord[] => (typeof value === "string" ? (JSON.parse(value) as PhotoRecord[]) : value);

function toRecord(row: Row): ProductRecord {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    status: row.status,
    name: { en: row.nameEn, fr: row.nameFr },
    description: row.descriptionEn ? { en: row.descriptionEn, fr: row.descriptionFr } : null,
    allergens: row.allergens,
    basePriceRs: row.basePriceRs,
    minQuantity: row.minQuantity,
    photos: parsePhotos(row.photos),
  };
}

/** A product with what ordering it needs (S-066): option groups and seasonal window. */
export type OrderableProductRecord = ProductRecord & { optionGroups: OptionGroupRecord[]; season: { startsOn: string; endsOn: string } | null };

function selectOrderable(db: Database) {
  return db.select({ ...columns, optionGroups: optionGroupsJson, seasonalStartsOn: product.seasonalStartsOn, seasonalEndsOn: product.seasonalEndsOn }).from(product);
}

function toOrderable({ optionGroups, seasonalStartsOn, seasonalEndsOn, ...row }: Awaited<ReturnType<typeof selectOrderable>>[number]): OrderableProductRecord {
  return {
    ...toRecord(row),
    optionGroups: parseJsonColumn(optionGroups),
    season: seasonalStartsOn && seasonalEndsOn ? { startsOn: seasonalStartsOn, endsOn: seasonalEndsOn } : null,
  };
}

/** The product with this current slug, whatever its status. */
export async function findProductBySlug(db: Database, slug: string): Promise<ProductRecord | undefined> {
  const [row] = await selectProducts(db).where(eq(product.slug, slug));
  return row ? toRecord(row) : undefined;
}

/** One product by id with its option groups, for addToBasket (any status; the caller decides). */
export async function findOrderableProduct(db: Database, id: string): Promise<OrderableProductRecord | undefined> {
  const [row] = await selectOrderable(db).where(eq(product.id, id));
  return row ? toOrderable(row) : undefined;
}

/**
 * The current slug of the product that once had `slug` (S-050, owner Q19), or undefined.
 * Callers try `findProductBySlug` first; a deleted product's history went with it (cascade).
 */
export async function findRenamedSlug(db: Database, slug: string): Promise<string | undefined> {
  const [row] = await db
    .select({ slug: product.slug })
    .from(productSlugHistory)
    .innerJoin(product, eq(product.id, productSlugHistory.productId))
    .where(eq(productSlugHistory.slug, slug))
    .limit(1);
  return row?.slug;
}

/** One product by id for the admin preview (S-051): any status, with its season window. */
export async function findProductPreview(
  db: Database,
  id: string,
): Promise<{ record: ProductRecord; season: { seasonalStartsOn: string | null; seasonalEndsOn: string | null } } | undefined> {
  const [row] = await db
    .select({ ...columns, seasonalStartsOn: product.seasonalStartsOn, seasonalEndsOn: product.seasonalEndsOn })
    .from(product)
    .where(eq(product.id, id));
  if (!row) return undefined;
  const { seasonalStartsOn, seasonalEndsOn, ...rest } = row;
  return { record: toRecord(rest), season: { seasonalStartsOn, seasonalEndsOn } };
}

/** A product page's availability facts (S-065): its own notice and its seasonal window. */
export interface ProductAvailability {
  /** NULL = the Settings default notice. */
  noticeDays: number | null;
  season: { startsOn: string; endsOn: string } | null;
}

/** The product with this current slug, whatever its status, with its notice, season and option groups (S-066), in one query. */
export async function findProductPageBySlug(db: Database, slug: string): Promise<{ record: ProductRecord & { optionGroups: OptionGroupRecord[] }; availability: ProductAvailability } | undefined> {
  const [row] = await db
    .select({ ...columns, noticeDays: product.noticeDays, seasonalStartsOn: product.seasonalStartsOn, seasonalEndsOn: product.seasonalEndsOn, optionGroups: optionGroupsJson })
    .from(product)
    .where(eq(product.slug, slug));
  if (!row) return undefined;
  const { noticeDays, seasonalStartsOn, seasonalEndsOn, optionGroups, ...rest } = row;
  // The table check keeps both dates set or both null.
  const season = seasonalStartsOn && seasonalEndsOn ? { startsOn: seasonalStartsOn, endsOn: seasonalEndsOn } : null;
  return { record: { ...toRecord(rest), optionGroups: parseJsonColumn(optionGroups) }, availability: { noticeDays, season } };
}

/** Products by id (any status); ids that do not exist are absent from the map. */
export async function findProductsByIds(db: Database, ids: readonly string[]): Promise<Map<string, ProductRecord>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await selectProducts(db).where(inArray(product.id, unique));
  return new Map(rows.map((row) => [row.id, toRecord(row)]));
}

export interface OptionGroupRecord {
  id: string;
  name: Localized;
  kind: string;
  required: boolean;
  textMaxLength: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  choices: { id: string; name: Localized; priceDeltaRs: number }[];
}

export type MenuProductRecord = ProductRecord & {
  status: "available" | "sold_out";
  optionGroups: OptionGroupRecord[];
  season: { startsOn: string; endsOn: string } | null;
  /** Own notice in days, null = the Settings default (S-046; the date picker, S-083). */
  noticeDays: number | null;
};

const productIdColumn = sql.raw(`"${getTableName(product)}"."id"`);

/** Option groups with their choices, in sort order, aggregated in the same statement. */
export const optionGroupsJson = sql<OptionGroupRecord[] | string>`coalesce((
  select json_agg(json_build_object(
    'id', og.id, 'name', json_build_object('en', og.name_en, 'fr', og.name_fr), 'kind', og.kind,
    'required', og.required, 'textMaxLength', og.text_max_length, 'quantityMin', og.quantity_min, 'quantityMax', og.quantity_max,
    'choices', coalesce((
      select json_agg(json_build_object('id', oc.id, 'name', json_build_object('en', oc.name_en, 'fr', oc.name_fr), 'priceDeltaRs', oc.price_delta_rs) order by oc.sort_order)
      from ${optionChoice} oc where oc.group_id = og.id
    ), '[]'::json)
  ) order by og.sort_order)
  from ${optionGroup} og where og.product_id = ${productIdColumn}
), '[]'::json)`;

export const parseJsonColumn = <T>(value: T | string): T => (typeof value === "string" ? (JSON.parse(value) as T) : value);

/**
 * Current slugs of the product pages a customer can open (not hidden), with their season, for
 * /sitemap.xml (S-224 AC4, AC5). Old slugs live in product_slug_history and are never listed.
 */
export async function listProductPageSlugs(db: Database): Promise<{ slug: string; season: { startsOn: string; endsOn: string } | null }[]> {
  const rows = await db
    .select({ slug: product.slug, startsOn: product.seasonalStartsOn, endsOn: product.seasonalEndsOn })
    .from(product)
    .where(ne(product.status, "hidden"))
    .orderBy(asc(product.sortOrder), asc(product.nameEn));
  return rows.map(({ slug, startsOn, endsOn }) => ({ slug, season: startsOn && endsOn ? { startsOn, endsOn } : null }));
}

/**
 * The public menu (ADR-0004): every product that is not hidden, in menu order, with photos
 * and option groups, in one query. Hidden products never leave the server.
 */
export async function listMenuProducts(db: Database): Promise<MenuProductRecord[]> {
  const rows = await db
    .select({ ...columns, optionGroups: optionGroupsJson, seasonalStartsOn: product.seasonalStartsOn, seasonalEndsOn: product.seasonalEndsOn, noticeDays: product.noticeDays })
    .from(product)
    .where(ne(product.status, "hidden"))
    .orderBy(asc(product.sortOrder), asc(product.nameEn));
  return rows.map(({ seasonalStartsOn, seasonalEndsOn, noticeDays, ...row }) => ({
    ...toRecord(row),
    status: row.status === "sold_out" ? ("sold_out" as const) : ("available" as const),
    optionGroups: parseJsonColumn(row.optionGroups),
    // The table check keeps both dates set or both null.
    season: seasonalStartsOn && seasonalEndsOn ? { startsOn: seasonalStartsOn, endsOn: seasonalEndsOn } : null,
    noticeDays,
  }));
}
