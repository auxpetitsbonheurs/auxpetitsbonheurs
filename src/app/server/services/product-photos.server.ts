// A product's photo list on save (S-047 AC3-AC5, FR-029, FR-062). The posted list replaces
// the stored one in card order. A path the product already has is kept as stored; any other
// path must be one issued to this admin for this editor session, not used by any product,
// and really stored in the bucket as a JPEG, PNG or WebP of at most 1 MB (checked by its
// first bytes, not only its declared type). Anything else: UPLOAD_REJECTED, nothing changes.
// The smaller copies beside a new photo (S-276, `<stem>-480w.<ext>`) are checked the same way
// and must have the original's type; a missing one is simply not used (the original serves),
// one that is there but fails the checks refuses the save like a bad original.
import { eq, inArray } from "drizzle-orm";
import { productPhoto } from "~/db/schema";
import { MAX_PHOTOS, type PhotoVariantWidth, UPLOAD_MAX_BYTES, isIssuedPhotoPath, isUploadType, sniffImageType, typeOfPath, variantPath, variantWidthsFor } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { StoredObject, UploadGateway } from "~/server/storage.server";

export interface PhotoInput {
  path: string;
  width: number;
  height: number;
}

/** A stored photo: what the editor posts plus the widths of its stored smaller copies. */
export interface StoredPhoto extends PhotoInput {
  variantWidths: number[];
}

/** New paths that passed the checks, each with the variant widths found beside it. */
export type VerifiedPhotos = ReadonlyMap<string, readonly number[]>;

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Reader = Database | Tx;

/** The product's stored photos by path (none for a new product). */
export async function storedPhotos(db: Reader, productId: string | undefined): Promise<Map<string, StoredPhoto>> {
  if (!productId) return new Map();
  const rows = await db
    .select({ path: productPhoto.storagePath, width: productPhoto.width, height: productPhoto.height, variantWidths: productPhoto.variantWidths })
    .from(productPhoto)
    .where(eq(productPhoto.productId, productId));
  return new Map(rows.map((r) => [r.path, r]));
}

/** A stored JPEG, PNG or WebP of at most 1 MB whose first bytes match its declared type. */
function isImageObject(object: StoredObject | null): object is StoredObject {
  if (!object) return false;
  const sniffed = sniffImageType(object.head);
  return object.size > 0 && object.size <= UPLOAD_MAX_BYTES && isUploadType(object.contentType) && sniffed === object.contentType;
}

export async function isStoredImage(uploads: UploadGateway, path: string): Promise<boolean> {
  return isImageObject(await uploads.inspect(PUBLIC_IMAGES_BUCKET, path).catch(() => null));
}

/**
 * The smaller copies stored beside a new photo `width` px wide (S-276): the widths found, or
 * null when one is there but is not an image of the original's type within the limits.
 * A copy that is missing (its upload failed, or an older editor sent none) is left out.
 */
export async function storedVariantWidths(uploads: UploadGateway, path: string, width: number): Promise<PhotoVariantWidth[] | null> {
  const type = typeOfPath(path);
  const widths = variantWidthsFor(width);
  const objects = await Promise.all(widths.map((w) => uploads.inspect(PUBLIC_IMAGES_BUCKET, variantPath(path, w)).catch(() => null)));
  if (objects.some((object) => object !== null && !(isImageObject(object) && object.contentType === type))) return null;
  return widths.filter((_, i) => objects[i] !== null);
}

/** A new photo's own check and its variants': the widths to store, or null to refuse. */
export async function checkNewPhoto(uploads: UploadGateway, photo: PhotoInput): Promise<PhotoVariantWidth[] | null> {
  const [original, variants] = await Promise.all([isStoredImage(uploads, photo.path), storedVariantWidths(uploads, photo.path, photo.width)]);
  return original ? variants : null;
}

export interface PhotoCheck {
  adminId: string;
  uploadSessionId: string | undefined;
  uploads: UploadGateway | null;
}

/**
 * The new photos of the posted list, verified, or null when the list may not be saved.
 * `known` are the product's photos read before the transaction; new paths (and their
 * variants) are checked against Storage here, outside any transaction.
 */
export async function photosAcceptable(db: Database, posted: PhotoInput[], known: ReadonlyMap<string, unknown>, check: PhotoCheck): Promise<VerifiedPhotos | null> {
  if (posted.length > MAX_PHOTOS) return null;
  const paths = posted.map((p) => p.path);
  if (new Set(paths).size !== paths.length) return null;
  const fresh = posted.filter((p) => !known.has(p.path));
  if (fresh.length === 0) return new Map();
  const { uploads, uploadSessionId, adminId } = check;
  if (!uploads || !uploadSessionId || !fresh.every((p) => isIssuedPhotoPath(p.path, adminId, uploadSessionId))) return null;
  const used = await db
    .select({ path: productPhoto.storagePath })
    .from(productPhoto)
    .where(inArray(productPhoto.storagePath, fresh.map((p) => p.path)))
    .limit(1);
  if (used.length > 0) return null;
  const checked = await Promise.all(fresh.map((photo) => checkNewPhoto(uploads, photo)));
  if (checked.some((variants) => variants === null)) return null;
  return new Map(fresh.map((p, i) => [p.path, checked[i]!]));
}

/**
 * Writes the list in the transaction and returns the paths that left it (their files are
 * removed after commit). `verified` are the new paths checked before the transaction: a
 * path that is neither stored for the product nor verified (a concurrent save removed it)
 * makes the save refuse rather than link an unchecked object.
 */
export async function replacePhotos(tx: Tx, productId: string, posted: PhotoInput[], verified: VerifiedPhotos): Promise<{ ok: true; removed: string[] } | { ok: false }> {
  const current = await storedPhotos(tx, productId);
  if (posted.some((p) => !current.has(p.path) && !verified.has(p.path))) return { ok: false };
  await tx.delete(productPhoto).where(eq(productPhoto.productId, productId));
  if (posted.length > 0) {
    await tx.insert(productPhoto).values(
      posted.map((photo, sortOrder) => {
        const kept = current.get(photo.path);
        const variantWidths = [...(kept?.variantWidths ?? verified.get(photo.path) ?? [])];
        return { productId, storagePath: photo.path, width: kept?.width ?? photo.width, height: kept?.height ?? photo.height, variantWidths, sortOrder };
      }),
    );
  }
  const keep = new Set(posted.map((p) => p.path));
  return { ok: true, removed: [...current.keys()].filter((path) => !keep.has(path)) };
}
