// Removing photo files whose rows are gone (S-045 delete, S-047 photos removed on save).
// Storage is asked once; on any failure the paths are queued in `storage_purge` for the
// hourly job and the caller carries on: a leftover file never fails a user's action.
import { storagePurge } from "~/db/schema";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";

/** Bundled sample images ("/images/…") are app assets, not Storage objects. */
export const isStoragePath = (path: string) => !path.startsWith("/");

/** Removes `paths` from the public bucket; returns how many were queued instead. */
export async function removePhotos(db: Database, storage: StorageGateway | null, paths: string[]): Promise<number> {
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
