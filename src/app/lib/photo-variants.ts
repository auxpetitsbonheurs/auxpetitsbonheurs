// Storing a photo's smaller copies (S-276) once the photo itself is uploaded. Loaded with the
// compression chunk (lib/image-compress), never with an editor route. Best effort: a copy
// that cannot be stored is skipped and the page shows the original instead, so nothing here
// ever fails the photo, delays it beyond the copies' own small uploads, or throws.
import type { PhotoVariant } from "./image-compress";
import { UPLOADS_URL, type UploadScopeName } from "./photo-upload";

const PUT_TIMEOUT_MS = 60_000;

type Issued = { path: string; signedUrl: string };

async function signVariants(sessionId: string, scope: UploadScopeName, original: { path: string; type: string }, variants: readonly PhotoVariant[]): Promise<Issued[] | null> {
  const body = new FormData();
  body.set("uploadSessionId", sessionId);
  if (scope !== "products") body.set("scope", scope);
  body.set("variantOf", original.path);
  for (const variant of variants) {
    body.append("type", original.type);
    body.append("size", String(variant.blob.size));
    body.append("width", String(variant.width));
  }
  const response = await fetch(UPLOADS_URL, { method: "POST", body, credentials: "same-origin", headers: { accept: "application/json" } });
  const result = (await response.json().catch(() => null)) as { ok?: boolean; uploads?: Issued[] } | null;
  return result?.ok && result.uploads?.length === variants.length ? result.uploads : null;
}

async function put(signedUrl: string, blob: Blob): Promise<boolean> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: blob,
    headers: { "content-type": blob.type, "cache-control": "max-age=31536000" },
    signal: AbortSignal.timeout(PUT_TIMEOUT_MS),
  });
  return response.ok;
}

/** Uploads the copies of the stored photo `original`; resolves to the widths stored (never rejects). */
export async function uploadVariants(sessionId: string, scope: UploadScopeName, original: { path: string; type: string }, variants: readonly PhotoVariant[]): Promise<number[]> {
  if (variants.length === 0) return [];
  try {
    const issued = await signVariants(sessionId, scope, original, variants);
    if (!issued) return [];
    const stored = await Promise.all(variants.map((variant, i) => put(issued[i]!.signedUrl, variant.blob).catch(() => false)));
    return variants.filter((_, i) => stored[i]).map((v) => v.width);
  } catch {
    return [];
  }
}
