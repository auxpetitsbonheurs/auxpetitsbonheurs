// `admin/product` requestUploadUrls (S-047 AC11, FR-062): signed upload URLs for up to five
// already-compressed photos. Each path is new and random under a prefix that names the
// scope, the admin and this editor session (`products/<adminId>/<uploadSessionId>/`, or
// `site/…` for the Settings hero and About images, Owners only; S-059 AC6), so a save can
// tell an issued path from any other object in the bucket. The bucket caps size and type as well.
// Smaller copies (S-276): with `variantOf` = a path issued to this admin in this session and
// scope, the URLs are for that photo's copies at the posted widths (`<stem>-<width>w.<ext>`,
// the original's type), so a save can find them by name and check them like the original.
import { PAGE_PHOTO_LIMITS, type SitePageKey, isIssuedPagePhotoPath, isSitePageKey, pagePhotoPrefix } from "~/domain/site-pages";
import {
  MAX_PHOTOS,
  PHOTO_VARIANT_WIDTHS,
  UPLOAD_EXTENSIONS,
  UPLOAD_MAX_BYTES,
  type UploadScope,
  isIssuedPhotoPath,
  isIssuedPromotionPath,
  isIssuedWorkshopPath,
  isIssuedSitePath,
  isPhotoVariantWidth,
  isUploadType,
  typeOfPath,
  uploadPrefix,
  variantPath,
} from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import { Uuid } from "~/server/contracts/shared";
import type { SignedUpload, UploadGateway } from "~/server/storage.server";

export type UploadUrlsResult = { ok: true; uploads: SignedUpload[] } | { ok: false; code: "VALIDATION_FAILED" | "UPLOAD_REJECTED" | "INTERNAL" };

export interface UploadRequest {
  uploadSessionId: string;
  /** `products` (editor; the default), `site` (Settings images; the route lets Owners only), `promotions` (S-053; any admin) or a brand page (`page:<key>`, E-13 S-247; any admin). */
  scope: UploadScope | { page: SitePageKey };
  files: { type: string; size: number }[];
  /** S-276: the issued original these files are smaller copies of, one per `widths` entry. */
  variantOf?: string;
  widths?: number[];
}

const PATH_MAX = 300;

/** FormData: `uploadSessionId`, optional `scope`, repeated `type` and `size` (one pair per file); for copies also `variantOf` and one `width` per file. */
export function parseUploadRequest(form: FormData): UploadRequest | null {
  const session = Uuid.safeParse(form.get("uploadSessionId"));
  const types = form.getAll("type").map(String);
  const sizes = form.getAll("size").map((s) => (/^\d{1,9}$/.test(String(s)) ? Number(s) : Number.NaN));
  const raw = form.get("scope") ?? "products";
  const pageKey = typeof raw === "string" && raw.startsWith("page:") ? raw.slice(5) : null;
  const scope = raw === "products" || raw === "site" || raw === "promotions" || raw === "workshops" ? raw : isSitePageKey(pageKey) ? { page: pageKey } : null;
  if (!session.success || types.length !== sizes.length || types.length === 0 || !scope) return null;
  const request: UploadRequest = { uploadSessionId: session.data.toLowerCase(), scope, files: types.map((type, i) => ({ type, size: sizes[i]! })) };
  const variantOf = form.get("variantOf");
  if (variantOf === null) return form.has("width") ? null : request;
  const widths = form.getAll("width").map((w) => (/^\d{1,5}$/.test(String(w)) ? Number(w) : Number.NaN));
  if (typeof variantOf !== "string" || variantOf.length > PATH_MAX || widths.length !== types.length) return null;
  return { ...request, variantOf, widths };
}

/** True when `path` was issued to this admin, in this session, for this scope. */
function isIssuedFor(scope: UploadRequest["scope"], path: string, adminId: string, uploadSessionId: string): boolean {
  if (typeof scope === "object") return isIssuedPagePhotoPath(path, scope.page, adminId, uploadSessionId);
  if (scope === "promotions") return isIssuedPromotionPath(path, adminId, uploadSessionId);
  if (scope === "workshops") return isIssuedWorkshopPath(path, adminId, uploadSessionId);
  return scope === "site" ? isIssuedSitePath(path, adminId, uploadSessionId) : isIssuedPhotoPath(path, adminId, uploadSessionId);
}

/** Where the files go: new random paths, or the copies of `variantOf`; null when the request may not have them. */
function pathsFor(request: UploadRequest, adminId: string): string[] | null {
  const { scope, files, variantOf, widths } = request;
  if (variantOf === undefined) {
    const prefix = typeof scope === "object" ? pagePhotoPrefix(scope.page, adminId, request.uploadSessionId) : uploadPrefix(scope, adminId, request.uploadSessionId);
    return files.map((f) => `${prefix}${crypto.randomUUID()}.${UPLOAD_EXTENSIONS[f.type as keyof typeof UPLOAD_EXTENSIONS]}`);
  }
  const type = typeOfPath(variantOf);
  const list = widths ?? [];
  const valid =
    isIssuedFor(scope, variantOf, adminId, request.uploadSessionId) &&
    list.length <= PHOTO_VARIANT_WIDTHS.length &&
    new Set(list).size === list.length &&
    list.every(isPhotoVariantWidth) &&
    files.every((f) => f.type === type);
  return valid ? list.map((w) => variantPath(variantOf, w)) : null;
}

export async function requestUploadUrls(storage: UploadGateway | null, adminId: string, request: UploadRequest): Promise<UploadUrlsResult> {
  const { files } = request;
  if (files.length > MAX_PHOTOS) return { ok: false, code: "UPLOAD_REJECTED" };
  // Pages without photos (Gallery's photos live in Gallery; Contact has none) get no URL.
  if (typeof request.scope === "object" && PAGE_PHOTO_LIMITS[request.scope.page] === 0) return { ok: false, code: "UPLOAD_REJECTED" };
  if (files.some((f) => !isUploadType(f.type) || !Number.isInteger(f.size) || f.size < 1 || f.size > UPLOAD_MAX_BYTES)) {
    return { ok: false, code: "UPLOAD_REJECTED" };
  }
  const paths = pathsFor(request, adminId);
  if (!paths) return { ok: false, code: "UPLOAD_REJECTED" };
  if (!storage) return { ok: false, code: "INTERNAL" };
  try {
    return { ok: true, uploads: await Promise.all(paths.map((path) => storage.signUpload(PUBLIC_IMAGES_BUCKET, path))) };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "upload_sign_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return { ok: false, code: "INTERNAL" };
  }
}
