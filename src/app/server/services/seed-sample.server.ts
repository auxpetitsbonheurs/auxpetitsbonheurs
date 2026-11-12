// `npm run seed:sample` (S-011): inserts the sample "Chocolate cake" with one photo so
// the walking skeleton has something to order. Refuses production; idempotent.
import { SAMPLE_PHOTO, SAMPLE_PRODUCT } from "~/db/sample-data";
import { eq } from "drizzle-orm";
import { product, productPhoto, productSlugHistory } from "~/db/schema";
import type { Database } from "~/server/db.server";

export type SeedSampleOutcome = "created" | "exists";

export class SeedSampleRefused extends Error {}

export async function seedSample(db: Database, appEnv: string | undefined): Promise<SeedSampleOutcome> {
  if (appEnv === "production") throw new SeedSampleRefused("seed:sample never runs with APP_ENV=production");
  return db.transaction(async (tx) => {
    // A renamed sample (or real cake) keeps its old slug in the history: never bring it back.
    const [renamed] = await tx.select({ slug: productSlugHistory.slug }).from(productSlugHistory).where(eq(productSlugHistory.slug, SAMPLE_PRODUCT.slug));
    if (renamed) return "exists";
    const [row] = await tx
      .insert(product)
      .values(SAMPLE_PRODUCT)
      .onConflictDoNothing({ target: product.slug })
      .returning({ id: product.id });
    if (!row) return "exists";
    await tx.insert(productPhoto).values({ ...SAMPLE_PHOTO, productId: row.id });
    return "created";
  });
}
