/** Ground rules from the build brief: Mauritius time zone, whole-rupee prices. */
export const BAKERY_TIME_ZONE = "Indian/Mauritius";
export const SUPPORTED_LOCALES = ["en", "fr"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const RUPEE_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/**
 * Formats a whole-rupee amount as "Rs 1,250". One format for both languages
 * (NFR-008, S-006): the locale is accepted so call sites stay uniform.
 */
export function formatRupees(amount: number, _locale?: Locale): string {
  return `Rs ${RUPEE_FORMAT.format(Math.round(amount))}`;
}

/** Customer URLs: English unprefixed, French under /fr (architecture: i18n & locale). */
export function localeFromPathname(pathname: string): Locale {
  return pathname === "/fr" || pathname.startsWith("/fr/") ? "fr" : "en";
}

/** The `path` (starting with "/") in `locale`: English unprefixed, French under /fr. */
export function localePath(locale: Locale, path: string): string {
  return locale === "fr" ? `/fr${path}` : path;
}
