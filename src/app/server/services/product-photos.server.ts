// A product's photo list on save (S-047 AC3-AC5, FR-029, FR-062). The posted list replaces
// the stored one in card order. A path the product already has is kept as stored; any other
// path must be one issued to this admin for this editor session, not used by any product,
// and really stored in the bucket as a JPEG, PNG or WebP of at most 1 MB (checked by its
// first bytes, not only its declared type). Anything else: UPLOAD_REJECTED, nothing changes.
import { eq, inArray } from "drizzle-orm";
import { productPhoto } from "~/db/schema";
import { MAX_PHOTOS, UPLOAD_MAX_BYTES, isIssuedPhotoPath, isUploadType, sniffImageType } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { UploadGateway } from "~/server/storage.server";

export interface PhotoInput {
  path: string;
  width: number;
  height: number;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Database | Tx;

/** The product's stored photos by path (none for a new product). */
export async function storedPhotos(db: Reader, productId: string | undefined): Promise<Map<string, PhotoInput>> {
  if (!productId) return new Map();
  const rows = await db
    .select({ path: productPhoto.storagePath, width: productPhoto.width, height: productPhoto.height })
    .from(productPhoto)
    .where(eq(productPhoto.productId, productId));
  return new Map(rows.map((r) => [r.path, r]));
}

async function isStoredImage(uploads: UploadGateway, path: string): Promise<boolean> {
  const object = await uploads.inspect(PUBLIC_IMAGES_BUCKET, path).catch(() => null);
  if (!object) return false;
  const sniffed = sniffImageType(object.head);
  return object.size > 0 && object.size <= UPLOAD_MAX_BYTES && isUploadType(object.contentType) && sniffed === object.contentType;
}

export interface PhotoCheck {
  adminId: string;
  uploadSessionId: string | undefined;
  uploads: UploadGateway | null;
}

/**
 * True when the posted list may be saved. `known` are the product's photos read before the
 * transaction; new paths are checked against Storage here, outside any transaction.
 */
export async function photosAcceptable(db: Database, posted: PhotoInput[], known: Map<string, PhotoInput>, check: PhotoCheck): Promise<boolean> {
  if (posted.length > MAX_PHOTOS) return false;
  const paths = posted.map((p) => p.path);
  if (new Set(paths).size !== paths.length) return false;
  const fresh = paths.filter((path) => !known.has(path));
  if (fresh.length === 0) return true;
  const { uploads, uploadSessionId, adminId } = check;
  if (!uploads || !uploadSessionId || !fresh.every((path) => isIssuedPhotoPath(path, adminId, uploadSessionId))) return false;
  const used = await db.select({ path: productPhoto.storagePath }).from(productPhoto).where(inArray(productPhoto.storagePath, fresh)).limit(1);
  if (used.length > 0) return false;
  const stored = await Promise.all(fresh.map((path) => isStoredImage(uploads, path)));
  return stored.every(Boolean);
}

/**
 * Writes the list in the transaction and returns the paths that left it (their files are
 * removed after commit). `verified` are the new paths checked before the transaction: a
 * path that is neither stored for the product nor verified (a concurrent save removed it)
 * makes the save refuse rather than link an unchecked object.
 */
export async function replacePhotos(tx: Tx, productId: string, posted: PhotoInput[], verified: Set<string>): Promise<{ ok: true; removed: string[] } | { ok: false }> {
  const current = await storedPhotos(tx, productId);
  if (posted.some((p) => !current.has(p.path) && !verified.has(p.path))) return { ok: false };
  await tx.delete(productPhoto).where(eq(productPhoto.productId, productId));
  if (posted.length > 0) {
    await tx.insert(productPhoto).values(
      posted.map((photo, sortOrder) => {
        const kept = current.get(photo.path);
        return { productId, storagePath: photo.path, width: kept?.width ?? photo.width, height: kept?.height ?? photo.height, sortOrder };
      }),
    );
  }
  const keep = new Set(posted.map((p) => p.path));
  return { ok: true, removed: [...current.keys()].filter((path) => !keep.has(path)) };
}
