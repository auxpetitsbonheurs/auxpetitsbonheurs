// `admin/menu` delete (S-045, FR-061): removes a product for good. The database does the
// rest in the same statement: photos, option groups, promotion links and slug history
// cascade; order items keep their snapshot (name, options, prices) with product_id set to
// NULL; a promotion that linked to it keeps no link (SET NULL). Its photo files are then
// removed from Storage; if that fails they are queued in `storage_purge` for the hourly
// job, and the delete still succeeds. Baskets are cookies: their line turns "No longer
// available" on the next menu read (ADR-0004).
import { eq } from "drizzle-orm";
import { product, productPhoto, storagePurge } from "~/db/schema";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";

export type DeleteProductResult = { ok: true; id: string; photosQueued: number } | { ok: false; code: "NOT_FOUND" };

/** Bundled sample images ("/images/…") are app assets, not Storage objects. */
const isStoragePath = (path: string) => !path.startsWith("/");

async function removePhotos(db: Database, storage: StorageGateway | null, paths: string[]): Promise<number> {
  if (paths.length === 0) return 0;
  try {
    if (!storage) throw new Error("no storage gateway configured");
    await storage.remove(PUBLIC_IMAGES_BUCKET, paths);
    return 0;
  } catch (error) {
    const lastError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
    await db
      .insert(storagePurge)
      .values(paths.map((path) => ({ bucket: PUBLIC_IMAGES_BUCKET, path, lastError })))
      .onConflictDoNothing();
    console.log(JSON.stringify({ level: "warn", event: "storage_remove_queued", count: paths.length, error: lastError }));
    return paths.length;
  }
}

export async function deleteProduct(db: Database, storage: StorageGateway | null, id: string): Promise<DeleteProductResult> {
  const paths = await db.transaction(async (tx) => {
    const photos = await tx.select({ path: productPhoto.storagePath }).from(productPhoto).where(eq(productPhoto.productId, id));
    const [deleted] = await tx.delete(product).where(eq(product.id, id)).returning({ id: product.id });
    return deleted ? photos.map((p) => p.path).filter(isStoragePath) : null;
  });
  if (paths === null) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id, photosQueued: await removePhotos(db, storage, paths) };
}
