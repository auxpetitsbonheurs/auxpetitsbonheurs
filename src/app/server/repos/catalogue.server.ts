// Catalogue reads for the customer site (S-011). Status rules (hidden = 404, sold out
// = shown but not addable) are applied by callers via domain/pricing productProblem.
import { eq, getTableName, inArray, sql } from "drizzle-orm";
import { product, productPhoto } from "~/db/schema";
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
  select json_agg(json_build_object('storagePath', pp.storage_path, 'width', pp.width, 'height', pp.height) order by pp.sort_order)
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

/** The product with this current slug, whatever its status. */
export async function findProductBySlug(db: Database, slug: string): Promise<ProductRecord | undefined> {
  const [row] = await selectProducts(db).where(eq(product.slug, slug));
  return row ? toRecord(row) : undefined;
}

/** Products by id (any status); ids that do not exist are absent from the map. */
export async function findProductsByIds(db: Database, ids: readonly string[]): Promise<Map<string, ProductRecord>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await selectProducts(db).where(inArray(product.id, unique));
  return new Map(rows.map((row) => [row.id, toRecord(row)]));
}
