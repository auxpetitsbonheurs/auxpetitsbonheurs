// Catalogue reads for the customer site (S-011). Status rules (hidden = 404, sold out
// = shown but not addable) are applied by callers via domain/pricing productProblem.
import { asc, eq, inArray } from "drizzle-orm";
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
};

const selectProducts = (db: Database) => db.select(columns).from(product);
type Row = Awaited<ReturnType<typeof selectProducts>>[number];

async function photosFor(db: Database, ids: string[]): Promise<Map<string, PhotoRecord[]>> {
  const map = new Map<string, PhotoRecord[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select({ productId: productPhoto.productId, storagePath: productPhoto.storagePath, width: productPhoto.width, height: productPhoto.height })
    .from(productPhoto)
    .where(inArray(productPhoto.productId, ids))
    .orderBy(asc(productPhoto.sortOrder));
  for (const { productId, ...photo } of rows) map.set(productId, [...(map.get(productId) ?? []), photo]);
  return map;
}

function toRecord(row: Row, photos: PhotoRecord[]): ProductRecord {
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
    photos,
  };
}

/** The product with this current slug, whatever its status. */
export async function findProductBySlug(db: Database, slug: string): Promise<ProductRecord | undefined> {
  const [row] = await selectProducts(db).where(eq(product.slug, slug));
  if (!row) return undefined;
  return toRecord(row, (await photosFor(db, [row.id])).get(row.id) ?? []);
}

/** Products by id (any status); ids that do not exist are absent from the map. */
export async function findProductsByIds(db: Database, ids: readonly string[]): Promise<Map<string, ProductRecord>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = await selectProducts(db).where(inArray(product.id, unique));
  const photos = await photosFor(db, rows.map((r) => r.id));
  return new Map(rows.map((row) => [row.id, toRecord(row, photos.get(row.id) ?? [])]));
}
