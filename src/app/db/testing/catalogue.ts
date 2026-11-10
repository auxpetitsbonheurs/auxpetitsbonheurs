// Test data builders for catalogue tables (unit tests on PGlite only).
import { SAMPLE_PHOTO, SAMPLE_PRODUCT } from "~/db/sample-data";
import { product, productPhoto } from "~/db/schema";
import type { Database } from "~/server/db.server";

type ProductRow = typeof product.$inferInsert;

/** Inserts a product (the sample cake unless overridden) with one photo; returns its id. */
export async function insertProduct(db: Database, overrides: Partial<ProductRow> = {}): Promise<string> {
  const [row] = await db
    .insert(product)
    .values({ ...SAMPLE_PRODUCT, ...overrides })
    .returning({ id: product.id });
  await db.insert(productPhoto).values({ ...SAMPLE_PHOTO, productId: row!.id });
  return row!.id;
}
