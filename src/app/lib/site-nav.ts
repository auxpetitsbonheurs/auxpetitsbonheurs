// Site navigation (FR-076, S-242, S-243): the 7 customer pages in the Owner's order. One list
// shared by the laptop bar, the phone menu, the no-JavaScript menu page and (S-253) the
// sitemap. Labels live in i18n under `nav.items.<key>`. Pure: no React.

export const SITE_NAV_ITEMS = [
  { key: "home", path: "/" },
  { key: "ourStory", path: "/our-story" },
  { key: "collection", path: "/menu" },
  { key: "customOrder", path: "/custom-cake" },
  { key: "workshops", path: "/workshops" },
  { key: "gallery", path: "/gallery" },
  { key: "contact", path: "/contact" },
] as const;

export type SiteNavItem = (typeof SITE_NAV_ITEMS)[number];
export type SiteNavKey = SiteNavItem["key"];

/** Alias named in the stories (S-242 Notes). */
export const siteNavItems = SITE_NAV_ITEMS;

/**
 * Pages the nav points at that later stories build (S-248 to S-252). Until then each answers
 * 200 with a calm "coming soon" page (noindex), so no nav link is ever a 404.
 */
export const PLACEHOLDER_PAGES = ["ourStory", "workshops", "gallery"] as const satisfies readonly SiteNavKey[];
export type PlaceholderPage = (typeof PLACEHOLDER_PAGES)[number];

/** The no-JavaScript fallback of the phone menu button (S-243 AC8). */
export const MENU_LINKS_PATH = "/menu-links";

/** The path without the /fr prefix and without a trailing slash ("/" stays "/"). */
function unprefixed(pathname: string): string {
  const path = pathname === "/fr" || pathname.startsWith("/fr/") ? pathname.slice(3) || "/" : pathname;
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/**
 * The nav item for the page at `pathname` (either language), or null. Home matches `/` only;
 * every other item matches its path and anything below it (`/menu/:slug` is Our collection).
 */
export function currentNavKey(pathname: string): SiteNavKey | null {
  const path = unprefixed(pathname);
  for (const item of SITE_NAV_ITEMS) {
    if (item.path === "/" ? path === "/" : path === item.path || path.startsWith(`${item.path}/`)) return item.key;
  }
  return null;
}
