// Browser side of a photo upload (S-047): ask the server for a signed URL for one compressed
// file (POST /admin/uploads, admin session cookie), then PUT the file straight to Storage
// with progress. XMLHttpRequest because fetch reports no upload progress.

export const UPLOADS_URL = "/admin/uploads";

export type UploadFailure = "signed_out" | "refused" | "network";

export class UploadError extends Error {
  constructor(readonly failure: UploadFailure) {
    super(`upload failed: ${failure}`);
  }
}

export interface IssuedUpload {
  path: string;
  signedUrl: string;
}

/** One signed URL for a file of `type` and `size` bytes, under this editor session's prefix. */
/** Where an upload goes: product photos, Settings images, or a brand page (`page:<key>`, E-13). */
export type UploadScopeName = "products" | "site" | "promotions" | `page:${string}`;

export async function requestUpload(uploadSessionId: string, type: string, size: number, signal?: AbortSignal, scope: UploadScopeName = "products"): Promise<IssuedUpload> {
  const body = new FormData();
  body.set("uploadSessionId", uploadSessionId);
  if (scope !== "products") body.set("scope", scope);
  body.append("type", type);
  body.append("size", String(size));
  let response: Response;
  try {
    response = await fetch(UPLOADS_URL, { method: "POST", body, credentials: "same-origin", signal, headers: { accept: "application/json" } });
  } catch {
    throw new UploadError("network");
  }
  // A session that ended answers the login page (redirect followed): say so, keep the form.
  if (response.redirected || response.status === 401) throw new UploadError("signed_out");
  const result = (await response.json().catch(() => null)) as { ok?: boolean; uploads?: IssuedUpload[] } | null;
  const upload = result?.ok ? result.uploads?.[0] : undefined;
  if (!upload) throw new UploadError(response.status >= 500 ? "network" : "refused");
  return upload;
}

/** PUTs `blob` to the signed URL; `onProgress` gets 0..1 as bytes leave the phone. */
export function putFile(signedUrl: string, blob: Blob, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", blob.type);
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(xhr.status >= 500 ? "network" : "refused")));
    xhr.onerror = () => reject(new UploadError("network"));
    xhr.ontimeout = () => reject(new UploadError("network"));
    xhr.timeout = 120_000;
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.onabort = () => reject(new UploadError("network"));
    xhr.send(blob);
  });
}
