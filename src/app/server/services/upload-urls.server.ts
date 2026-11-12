// `admin/product` requestUploadUrls (S-047 AC11, FR-062): signed upload URLs for up to five
// already-compressed photos. Each path is new and random under a prefix that names the
// scope, the admin and this editor session (`products/<adminId>/<uploadSessionId>/`, or
// `site/…` for the Settings hero and About images, Owners only; S-059 AC6), so a save can
// tell an issued path from any other object in the bucket. The bucket caps size and type as well.
import { MAX_PHOTOS, UPLOAD_EXTENSIONS, UPLOAD_MAX_BYTES, type UploadScope, isUploadType, uploadPrefix } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import { Uuid } from "~/server/contracts/shared";
import type { SignedUpload, UploadGateway } from "~/server/storage.server";

export type UploadUrlsResult = { ok: true; uploads: SignedUpload[] } | { ok: false; code: "VALIDATION_FAILED" | "UPLOAD_REJECTED" | "INTERNAL" };

export interface UploadRequest {
  uploadSessionId: string;
  /** `products` (editor; the default) or `site` (Settings images; the route lets Owners only). */
  scope: UploadScope;
  files: { type: string; size: number }[];
}

/** FormData: `uploadSessionId`, optional `scope`, repeated `type` and `size` (one pair per file). */
export function parseUploadRequest(form: FormData): UploadRequest | null {
  const session = Uuid.safeParse(form.get("uploadSessionId"));
  const types = form.getAll("type").map(String);
  const sizes = form.getAll("size").map((s) => (/^\d{1,9}$/.test(String(s)) ? Number(s) : Number.NaN));
  const scope = form.get("scope") ?? "products";
  if (!session.success || types.length !== sizes.length || types.length === 0 || (scope !== "products" && scope !== "site")) return null;
  return { uploadSessionId: session.data.toLowerCase(), scope, files: types.map((type, i) => ({ type, size: sizes[i]! })) };
}

export async function requestUploadUrls(storage: UploadGateway | null, adminId: string, request: UploadRequest): Promise<UploadUrlsResult> {
  const { files } = request;
  if (files.length > MAX_PHOTOS) return { ok: false, code: "UPLOAD_REJECTED" };
  if (files.some((f) => !isUploadType(f.type) || !Number.isInteger(f.size) || f.size < 1 || f.size > UPLOAD_MAX_BYTES)) {
    return { ok: false, code: "UPLOAD_REJECTED" };
  }
  if (!storage) return { ok: false, code: "INTERNAL" };
  const prefix = uploadPrefix(request.scope, adminId, request.uploadSessionId);
  const paths = files.map((f) => `${prefix}${crypto.randomUUID()}.${UPLOAD_EXTENSIONS[f.type as keyof typeof UPLOAD_EXTENSIONS]}`);
  try {
    return { ok: true, uploads: await Promise.all(paths.map((path) => storage.signUpload(PUBLIC_IMAGES_BUCKET, path))) };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "upload_sign_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return { ok: false, code: "INTERNAL" };
  }
}
