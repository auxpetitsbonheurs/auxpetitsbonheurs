// POST /api/custom-cake/uploads (contracts.md v0.43 `site/custom-cake` requestUploadUrls, as
// built: a resource route so the photo picker can call it from its upload queue; E-08 S-153
// AC1/AC2, S-162 AC1/AC3). JSON in: `{ uploadSessionId, files: { type, size }[1..5],
// turnstileToken? }`; JSON out: `{ ok, uploads: { path, signedUrl, token }[] }` or the error
// envelope. Public: RL-upload per IP and Turnstile instead of a session. Never cached.
import { clientIp } from "~/server/auth-rate-limit.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { requestUploadUrls } from "~/server/services/custom-request.server";
import { requestPhotosContext } from "~/server/storage.server";
import { turnstileContext } from "~/server/turnstile.server";
import type { Route } from "./+types/request-uploads";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } as const;

const STATUS = { VALIDATION_FAILED: 400, BOT_CHECK_FAILED: 400, UPLOAD_REJECTED: 422, RATE_LIMITED: 429, INTERNAL: 500 } as const;

/** A page on another site cannot spend this visitor's upload quota (browsers send Origin on POST). */
function crossSite(request: Request, url: URL): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin !== url.origin;
}

export async function action({ request, url, context }: Route.ActionArgs) {
  if (crossSite(request, url)) return Response.json({ ok: false, error: { code: "FORBIDDEN" } }, { status: 403, headers: HEADERS });
  const body: unknown = await request.json().catch(() => null);
  const result = await requestUploadUrls(body, {
    db: context.get(requestDbContext).db,
    now: context.get(clockContext).now(),
    locale: "en",
    ip: clientIp(request),
    turnstile: context.get(turnstileContext),
    photos: context.get(requestPhotosContext),
  });
  if (result.ok) return Response.json(result, { headers: HEADERS });
  const headers: Record<string, string> = { ...HEADERS };
  if (result.code === "RATE_LIMITED") headers["Retry-After"] = String(result.retryAfterSeconds);
  const extra = result.code === "RATE_LIMITED" ? { retryAfterSeconds: result.retryAfterSeconds } : {};
  return Response.json({ ok: false, error: { code: result.code }, ...extra }, { status: STATUS[result.code], headers });
}

/** Nothing to read here. */
export function loader() {
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}
