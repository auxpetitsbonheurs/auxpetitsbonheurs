// Browser side of a custom request photo upload (E-08 S-153): ask the site for a signed URL to
// the private bucket (POST /api/custom-cake/uploads, Turnstile token, no session), then PUT the
// shrunk file straight to Storage with `putFile` (progress through XMLHttpRequest).
export { putFile } from "./photo-upload";

export const REQUEST_UPLOADS_URL = "/api/custom-cake/uploads";

export type RequestUploadFailure = "rate_limited" | "bot" | "refused" | "network";

export class RequestUploadError extends Error {
  constructor(
    readonly failure: RequestUploadFailure,
    readonly retryAfterSeconds?: number,
  ) {
    super(`request upload failed: ${failure}`);
  }
}

export interface IssuedRequestUpload {
  path: string;
  signedUrl: string;
}

const FAILURES: Record<string, RequestUploadFailure> = { RATE_LIMITED: "rate_limited", BOT_CHECK_FAILED: "bot", UPLOAD_REJECTED: "refused", VALIDATION_FAILED: "refused" };

/** One signed URL for one shrunk photo of `type` and `size` bytes, under this form's session. */
export async function requestUploadUrl(uploadSessionId: string, type: string, size: number, turnstileToken: string | undefined, send: typeof fetch = fetch): Promise<IssuedRequestUpload> {
  let response: Response;
  try {
    response = await send(REQUEST_UPLOADS_URL, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ uploadSessionId, files: [{ type, size }], ...(turnstileToken ? { turnstileToken } : {}) }),
    });
  } catch {
    throw new RequestUploadError("network");
  }
  const body = (await response.json().catch(() => null)) as { ok?: boolean; uploads?: IssuedRequestUpload[]; error?: { code?: string }; retryAfterSeconds?: number } | null;
  const upload = body?.ok ? body.uploads?.[0] : undefined;
  if (upload) return upload;
  const failure = FAILURES[body?.error?.code ?? ""] ?? "network";
  throw new RequestUploadError(failure, body?.retryAfterSeconds);
}
