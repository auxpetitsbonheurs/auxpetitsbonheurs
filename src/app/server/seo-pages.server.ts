// Which customer pages search engines may index (S-253 AC4, AC5, AC6; FR-081). The sitemap and
// the pages' `robots` tag read the same answer, so a page is never listed but noindex.
//
// Seam for the content pages (S-245..S-250): `contentPagePlaceholders` is the ONE place that
// says whether a content page still holds placeholder text. Until the `site_page` table exists
// every content page counts as placeholder (noindex, out of the sitemap). S-245 replaces its
// body with the `site_page.is_placeholder` read (one query, the Settings cache pattern); each
// page's `meta` passes the same flag as `seoMeta({ noindex })` (lib/seo.ts). Nothing else
// changes: a page the client edits joins the sitemap on the next read.
import type { Database } from "~/server/db.server";

/** The S-245 page keys and their unprefixed paths (docs/content/sitemap.md slugs). */
export const CONTENT_PAGE_PATHS = {
  our_story: "/our-story",
  custom_order: "/custom-cake",
  workshops: "/workshops",
  gallery: "/gallery",
  contact: "/contact",
} as const;

export type ContentPageKey = keyof typeof CONTENT_PAGE_PATHS;
export type PlaceholderFlags = Record<ContentPageKey, boolean>;

/** Indexable pages that hold no editable text (always in the sitemap, never noindex). */
export const ALWAYS_INDEXED_PATHS = ["/", "/menu"] as const;

const ALL_PLACEHOLDER: PlaceholderFlags = { our_story: true, custom_order: true, workshops: true, gallery: true, contact: true };

/**
 * True per page while it still holds placeholder text. S-245: read `site_page.is_placeholder`
 * here (a page missing from the table counts as placeholder).
 */
export async function contentPagePlaceholders(_db: Database): Promise<PlaceholderFlags> {
  return ALL_PLACEHOLDER;
}

/** Unprefixed sitemap paths for these flags: the fixed pages, then content pages the client has edited. */
export function indexablePaths(flags: PlaceholderFlags): string[] {
  const edited = (Object.keys(CONTENT_PAGE_PATHS) as ContentPageKey[]).filter((key) => !flags[key]).map((key) => CONTENT_PAGE_PATHS[key]);
  return [...ALWAYS_INDEXED_PATHS, ...edited];
}

/** Unprefixed paths for /sitemap.xml. */
export async function sitemapPaths(db: Database): Promise<string[]> {
  return indexablePaths(await contentPagePlaceholders(db));
}
