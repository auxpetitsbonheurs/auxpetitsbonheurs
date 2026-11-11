// Admin catalogue reads (S-041): every product whatever its status, grouped by type, with
// the main photo and what the row tags need. One query.
import { asc, eq, getTableName, isNotNull, sql } from "drizzle-orm";
import { admin, product, productPhoto, settings } from "~/db/schema";
import { PRODUCT_TYPES, type ProductStatusValue, type ProductType, type SeasonalTag, seasonalTag } from "~/domain/product";
import { publicImageUrl } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { Localized } from "./catalogue.server";

export interface AdminMenuRow {
  id: string;
  name: Localized;
  status: ProductStatusValue;
  imageUrl: string | null;
  sortOrder: number;
  /** Base price until option groups exist (S-048 may refine with the lowest choice). */
  fromPriceRs: number;
  seasonal: SeasonalTag;
}

export type AdminMenuByType = Record<ProductType, AdminMenuRow[]>;

// Table-qualified on purpose: a bare "id" inside the subquery would mean product_photo.id.
const productId = sql.raw(`"${getTableName(product)}"."id"`);

const mainPhoto = sql<string | null>`(
  select pp.storage_path from ${productPhoto} pp
  where pp.product_id = ${productId}
  order by pp.sort_order limit 1
)`;

export interface AdminProduct {
  id: string;
  slug: string;
  type: ProductType;
  category: string | null;
  name: Localized;
  description: { en: string | null; fr: string | null };
  basePriceRs: number;
  allergens: string[];
  noticeDays: number | null;
  status: ProductStatusValue;
  photoCount: number;
  /** Who saved it last and when (ISO instant); null before anyone saved it in the editor. */
  updated: { name: string; at: string } | null;
}

/** One product for the editor, whatever its status. */
export async function findAdminProduct(db: Database, id: string): Promise<AdminProduct | undefined> {
  const [row] = await db
    .select({
      id: product.id,
      slug: product.slug,
      type: product.type,
      category: product.category,
      nameEn: product.nameEn,
      nameFr: product.nameFr,
      descriptionEn: product.descriptionEn,
      descriptionFr: product.descriptionFr,
      basePriceRs: product.basePriceRs,
      allergens: product.allergens,
      noticeDays: product.noticeDays,
      status: product.status,
      updatedAt: product.updatedAt,
      updatedByName: admin.name,
      photoCount: sql<number>`(select count(*)::int from ${productPhoto} pp where pp.product_id = ${productId})`,
    })
    .from(product)
    .leftJoin(admin, eq(admin.id, product.updatedBy))
    .where(eq(product.id, id));
  if (!row) return undefined;
  const { nameEn, nameFr, descriptionEn, descriptionFr, updatedAt, updatedByName, ...rest } = row;
  return {
    ...rest,
    photoCount: Number(rest.photoCount),
    name: { en: nameEn, fr: nameFr },
    description: { en: descriptionEn, fr: descriptionFr },
    updated: updatedByName ? { name: updatedByName, at: updatedAt.toISOString() } : null,
  };
}

/** Category labels already in use, for the editor's suggestions. */
export async function listCategories(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: product.category })
    .from(product)
    .where(isNotNull(product.category))
    .orderBy(asc(product.category));
  return rows.map((r) => r.category!).filter((c) => c.trim() !== "");
}

/** Settings values the editor shows as defaults (blank notice = this default, FR-062). */
export async function getProductDefaults(db: Database): Promise<{ noticeDays: number; cakeMessageMax: number }> {
  const [row] = await db.select({ noticeDays: settings.defaultNoticeDays, cakeMessageMax: settings.cakeMessageMax }).from(settings).where(eq(settings.id, 1));
  return row ?? { noticeDays: 3, cakeMessageMax: 40 };
}

/** All products by type (fixed group order), in menu order within a type. */
export async function listAdminMenu(db: Database, { today, supabaseUrl }: { today: string; supabaseUrl: string }): Promise<AdminMenuByType> {
  const rows = await db
    .select({
      id: product.id,
      type: product.type,
      nameEn: product.nameEn,
      nameFr: product.nameFr,
      status: product.status,
      sortOrder: product.sortOrder,
      basePriceRs: product.basePriceRs,
      seasonalStartsOn: product.seasonalStartsOn,
      seasonalEndsOn: product.seasonalEndsOn,
      photo: mainPhoto,
    })
    .from(product)
    .orderBy(asc(product.sortOrder), asc(product.nameEn));
  const byType = Object.fromEntries(PRODUCT_TYPES.map((type) => [type, [] as AdminMenuRow[]])) as AdminMenuByType;
  for (const row of rows) {
    byType[row.type].push({
      id: row.id,
      name: { en: row.nameEn, fr: row.nameFr },
      status: row.status,
      imageUrl: row.photo ? publicImageUrl(row.photo, supabaseUrl) : null,
      sortOrder: row.sortOrder,
      fromPriceRs: row.basePriceRs,
      seasonal: seasonalTag(row, today),
    });
  }
  return byType;
}
