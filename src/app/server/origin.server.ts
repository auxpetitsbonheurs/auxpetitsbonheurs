// CSRF defence for admin mutations (architecture "Auth": SameSite=Lax cookies plus an
// Origin/Host check on every non-GET request). Refusals are 403 FORBIDDEN.
import { data } from "react-router";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

/** True when the request came from this site: Origin, or (no Origin) Referer, equals the request's origin. */
export function isSameOrigin(request: Request): boolean {
  const expected = new URL(request.url).origin;
  const origin = request.headers.get("origin");
  if (origin !== null) return origin === expected;
  const referer = request.headers.get("referer");
  return referer !== null && originOf(referer) === expected;
}

export function forbiddenBody() {
  return { ok: false as const, error: { code: "FORBIDDEN" as const, message: "Forbidden" } };
}

/** Throws a 403 for a cross-site non-GET request; GET and HEAD are never refused. */
export function assertSameOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;
  if (!isSameOrigin(request)) throw data(forbiddenBody(), { status: 403 });
}

const ADMIN_PATH = /^\/admin(?:[/.?]|$)/;

/**
 * Called by the Worker before React Router (whose own origin check answers 400): a
 * cross-site non-GET request to any /admin path is a 403 FORBIDDEN, private and no-store.
 */
export function refuseCrossSiteAdminRequest(request: Request): Response | undefined {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return undefined;
  if (!ADMIN_PATH.test(new URL(request.url).pathname) || isSameOrigin(request)) return undefined;
  return Response.json(forbiddenBody(), { status: 403, headers: { "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
