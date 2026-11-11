// Admin catalogue reads (S-041): every product whatever its status, grouped by type, with
// the main photo and what the row tags need. One query.
import { asc, getTableName, sql } from "drizzle-orm";
import { product, productPhoto } from "~/db/schema";
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

const mainPhoto = sql<string | null>`(
  select pp.storage_path from ${productPhoto} pp
  where pp.product_id = ${sql.raw(`"${getTableName(product)}"."id"`)}
  order by pp.sort_order limit 1
)`;

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
