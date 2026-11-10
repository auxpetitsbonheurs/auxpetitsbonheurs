// Customer locale rules (catalogue spec "Locale handling", FR-001). Pure: the
// site layout's middleware feeds it the request and applies the decision.
import { type Locale, SUPPORTED_LOCALES, localeFromPathname, localePath } from "./locale";

export const LOCALE_COOKIE = "apb_locale";
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export interface LocaleRequest {
  pathname: string;
  search: string;
  /** Raw `apb_locale` cookie value, if any. */
  cookie: string | undefined;
  acceptLanguage: string | null | undefined;
  /** `Sec-Fetch-Site`; "same-origin" means an in-site navigation (e.g. the switch). */
  secFetchSite: string | null | undefined;
}

export interface LocaleDecision {
  redirectTo?: string;
  rememberLocale?: Locale;
}

const isLocale = (value: string | undefined): value is Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(value ?? "");

/** The same page in `locale`, query kept: /fr/basket?x=1 <-> /basket?x=1. */
export function twinPath(pathname: string, search: string, locale: Locale): string {
  const unprefixed = localeFromPathname(pathname) === "fr" ? pathname.slice(3) || "/" : pathname;
  return `${localePath(locale, unprefixed)}${search}`;
}

/** First language tag of Accept-Language starts with "fr". */
function prefersFrench(acceptLanguage: string | null | undefined): boolean {
  const first = (acceptLanguage ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return first === "fr" || first.startsWith("fr-");
}

function wantedOnEntry(request: LocaleRequest, cookie: Locale | undefined): Locale {
  if (request.secFetchSite === "same-origin") return "en"; // in-site: never trap the visitor
  if (cookie) return cookie;
  return prefersFrench(request.acceptLanguage) ? "fr" : "en";
}

/**
 * The URL is authoritative. Only an unprefixed (English) URL may redirect: on a
 * first visit by Accept-Language, on a returning entry navigation by the cookie;
 * in-site navigation never redirects. The page locale is remembered for a year.
 */
export function decideLocale(request: LocaleRequest): LocaleDecision {
  const pageLocale = localeFromPathname(request.pathname);
  const cookie = isLocale(request.cookie) ? request.cookie : undefined;
  if (pageLocale === "en" && wantedOnEntry(request, cookie) === "fr") {
    return { redirectTo: twinPath(request.pathname, request.search, "fr") };
  }
  return cookie === pageLocale ? {} : { rememberLocale: pageLocale };
}

export function localeCookie(locale: Locale): string {
  return `${LOCALE_COOKIE}=${locale}; Max-Age=${ONE_YEAR_SECONDS}; Path=/; SameSite=Lax; Secure; HttpOnly`;
}
