// `admin/menu` delete (S-045, FR-061): removes a product for good. The database does the
// rest in the same statement: photos, option groups, promotion links and slug history
// cascade; order items keep their snapshot (name, options, prices) with product_id set to
// NULL; a promotion that linked to it keeps no link (SET NULL). Its photo files are then
// removed from Storage; if that fails they are queued in `storage_purge` for the hourly
// job, and the delete still succeeds. Baskets are cookies: their line turns "No longer
// available" on the next menu read (ADR-0004).
import { eq } from "drizzle-orm";
import { product, productPhoto } from "~/db/schema";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";
import { isStoragePath, removePhotos } from "./storage-cleanup.server";

export type DeleteProductResult = { ok: true; id: string; photosQueued: number } | { ok: false; code: "NOT_FOUND" };

export async function deleteProduct(db: Database, storage: StorageGateway | null, id: string): Promise<DeleteProductResult> {
  const paths = await db.transaction(async (tx) => {
    const photos = await tx.select({ path: productPhoto.storagePath }).from(productPhoto).where(eq(productPhoto.productId, id));
    const [deleted] = await tx.delete(product).where(eq(product.id, id)).returning({ id: product.id });
    return deleted ? photos.map((p) => p.path).filter(isStoragePath) : null;
  });
  if (paths === null) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, id, photosQueued: await removePhotos(db, storage, paths) };
}
