// Photo upload rules (FR-029, FR-062, NFR-001, NFR-009). Pure: shared by the browser
// (compression, pre-upload checks) and the server (requestUploadUrls, save checks).
// Re-exported by app/server/contracts/shared.ts (contracts.md "Limits").

export const MAX_PHOTOS = 5;
/** Server hard cap per stored object (bucket limit too). */
export const UPLOAD_MAX_BYTES = 1_048_576;
/** What the browser aims for (NFR-009). */
export const UPLOAD_TARGET_BYTES = 307_200;
/** A source photo above this is refused before anything is sent. */
export const SOURCE_MAX_BYTES = 10 * 1_048_576;
/** Long edge of a stored photo. */
export const PHOTO_MAX_EDGE = 1600;

/** What may be stored (bucket `allowed_mime_types`). */
export const UPLOAD_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type UploadType = (typeof UPLOAD_TYPES)[number];

export const UPLOAD_EXTENSIONS: Record<UploadType, string> = { "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" };

export function isUploadType(value: string): value is UploadType {
  return (UPLOAD_TYPES as readonly string[]).includes(value);
}

/** What the browser accepts as a source (HEIC/HEIF from iPhones is converted). */
export const SOURCE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;
const SOURCE_EXTENSIONS = /\.(jpe?g|png|webp|heic|heif)$/i;
const HEIC_EXTENSIONS = /\.(heic|heif)$/i;

export type SourceProblem = "type" | "too_big";

/**
 * Why a chosen file cannot be used, before any work: not a photo we read, or over 10 MB.
 * Some browsers give HEIC files an empty type, so the extension counts when the type is blank.
 */
export function sourceProblem(file: { name: string; type: string; size: number }): SourceProblem | null {
  const type = file.type.toLowerCase();
  const known = type === "" ? SOURCE_EXTENSIONS.test(file.name) : (SOURCE_TYPES as readonly string[]).includes(type);
  if (!known) return "type";
  return file.size > SOURCE_MAX_BYTES ? "too_big" : null;
}

export function isHeicSource(file: { name: string; type: string }): boolean {
  const type = file.type.toLowerCase();
  return type === "image/heic" || type === "image/heif" || (type === "" && HEIC_EXTENSIONS.test(file.name));
}

/** Size that fits `maxEdge` on the long edge, never enlarged, at least 1 px each way. */
export function fitWithin(width: number, height: number, maxEdge = PHOTO_MAX_EDGE): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The stored type from the file's first bytes (magic numbers); null when it is none of ours. */
export function sniffImageType(head: Uint8Array): UploadType | null {
  const at = (offset: number, bytes: number[]) => bytes.every((b, i) => head[offset + i] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "image/webp";
  return null;
}

/** Product photos an admin uploads: `products/<adminId>/<uploadSessionId>/<uuid>.<ext>`. */
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const PRODUCT_PHOTO_PATH = new RegExp(`^products/(${UUID})/(${UUID})/${UUID}\\.(webp|jpg|png)$`);

export function productPhotoPrefix(adminId: string, uploadSessionId: string): string {
  return `products/${adminId}/${uploadSessionId}/`;
}

/** True when `path` is exactly a path issued to this admin for this editor session. */
export function isIssuedPhotoPath(path: string, adminId: string, uploadSessionId: string): boolean {
  const match = PRODUCT_PHOTO_PATH.exec(path);
  return match !== null && match[1] === adminId.toLowerCase() && match[2] === uploadSessionId.toLowerCase();
}
