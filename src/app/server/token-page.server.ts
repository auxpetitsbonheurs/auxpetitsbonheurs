// Shared rules for the token-bearing customer pages (/order/:token/confirmed, /t/:token):
// format check before any database read, privacy headers on every response, and the
// order's language as the default (checkout spec "Tracking actions", threat-model C1, C3, C7, G-07).
import { readCookie } from "~/lib/cookies";
import { type Locale, localeFromPathname } from "~/lib/locale";
import { LOCALE_COOKIE, twinPath } from "~/lib/locale-detect";
import { responseHeaders } from "~/server/response-headers.server";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** A tracking token is 32 random bytes as 43 base64url characters; anything else is a 404. */
export function isTrackingToken(token: string | undefined): token is string {
  return token !== undefined && TOKEN_PATTERN.test(token);
}

/** Never cached or indexed, and the token never leaves in a Referer header. */
export const TOKEN_PAGE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
} as const;

/** Route middleware: applies TOKEN_PAGE_HEADERS to pages, data requests, 404s and redirects alike. */
export const tokenPageHeaders = responseHeaders(TOKEN_PAGE_HEADERS);

/**
 * Where an unprefixed (English) token link should go for an order placed in French:
 * only on an entry navigation by a visitor with no remembered language. The switch and
 * an explicit language choice always win (catalogue spec "Locale handling").
 */
export function orderLanguageRedirect(request: Request, url: URL, orderLocale: Locale): string | undefined {
  if (orderLocale !== "fr" || localeFromPathname(url.pathname) === "fr") return undefined;
  if (readCookie(request, LOCALE_COOKIE) !== undefined) return undefined;
  if (request.headers.get("sec-fetch-site") === "same-origin") return undefined;
  return twinPath(url.pathname, url.search, "fr");
}
