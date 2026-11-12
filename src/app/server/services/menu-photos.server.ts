// Photos for the real-menu seed (S-241 AC5, NFR-001, NFR-009). Node only (`npm run seed:menu`,
// never the Worker): the source JPEG is turned upright, shrunk to at most 1600 px on the long
// edge and re-encoded as WebP of at most 300 kB with no metadata (EXIF, GPS), the same target
// the editor's in-browser compression uses (S-047). The upload then goes through the same
// path as the editor: a signed upload URL for an issued path, a PUT, and the save-time check
// of what Storage really holds (photosAcceptable: issued prefix, unused, size, magic bytes).
import sharp from "sharp";
import { PHOTO_MAX_EDGE, UPLOAD_TARGET_BYTES, productPhotoPrefix } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { UploadGateway } from "~/server/storage.server";
import { type PhotoInput, photosAcceptable } from "./product-photos.server";

export interface PreparedPhoto {
  bytes: Uint8Array;
  width: number;
  height: number;
  contentType: "image/webp";
}

/** Qualities tried in turn until the file fits the 300 kB target. */
const QUALITIES = [82, 74, 66, 58, 50, 42];

export class MenuPhotoError extends Error {}

/** Upright, ≤ 1600 px long edge, WebP ≤ 300 kB, metadata dropped. */
export async function prepareMenuPhoto(source: Uint8Array): Promise<PreparedPhoto> {
  for (const quality of QUALITIES) {
    const { data, info } = await sharp(source)
      .rotate()
      .resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ quality })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= UPLOAD_TARGET_BYTES) return { bytes: new Uint8Array(data), width: info.width, height: info.height, contentType: "image/webp" };
  }
  throw new MenuPhotoError("photo stays over 300 kB at the lowest quality");
}

/**
 * Who the seed uploads as: not a real admin (no row, so `updated_by` stays empty), only the
 * owner of its upload prefix `products/<this id>/<run id>/`, so the S-047 path check applies.
 */
export const SEED_UPLOADER_ID = "00000000-0000-4000-8000-000000000241";

export interface MenuPhotoUploads extends UploadGateway {
  /** PUTs the bytes to a signed upload URL; throws when Storage does not accept them. */
  put(signedUrl: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

/** PUT to a Supabase signed upload URL (no overwrite), like the editor's upload queue. */
export function signedPut(send: typeof fetch = fetch): MenuPhotoUploads["put"] {
  return async (signedUrl, bytes, contentType) => {
    const response = await send(signedUrl, {
      method: "PUT",
      headers: { "content-type": contentType, "cache-control": "max-age=31536000" },
      body: new Blob([new Uint8Array(bytes)], { type: contentType }),
      signal: AbortSignal.timeout(30_000),
    });
    await response.body?.cancel();
    // Never echo the signed URL: it carries an upload token.
    if (!response.ok) throw new MenuPhotoError(`storage upload answered ${response.status}`);
  };
}

/**
 * Uploads one prepared photo under the seed's prefix for this run and checks it exactly as a
 * save from the editor would. Returns the photo to link, or throws (nothing is linked).
 */
export async function uploadMenuPhoto(db: Database, uploads: MenuPhotoUploads, runId: string, photo: PreparedPhoto): Promise<PhotoInput> {
  const path = `${productPhotoPrefix(SEED_UPLOADER_ID, runId)}${crypto.randomUUID()}.webp`;
  const signed = await uploads.signUpload(PUBLIC_IMAGES_BUCKET, path);
  await uploads.put(signed.signedUrl, photo.bytes, photo.contentType);
  const linked = { path, width: photo.width, height: photo.height };
  const accepted = await photosAcceptable(db, [linked], new Map(), { adminId: SEED_UPLOADER_ID, uploadSessionId: runId, uploads });
  if (!accepted) throw new MenuPhotoError("the stored photo failed the upload checks");
  return linked;
}
