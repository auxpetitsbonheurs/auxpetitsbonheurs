// Which customer pages search engines may index (S-253 AC4, AC5, AC6; FR-081). The sitemap and
// the pages' `robots` tag read the same answer, so a page is never listed but noindex.
//
// The content pages (S-245..S-250): `contentPagePlaceholders` is the ONE place that says
// whether a content page still holds placeholder text: `site_page.is_placeholder` (one query,
// cached per isolate like Settings, cleared by an admin save). Each page's `meta` passes the
// flag of its own page read as `seoMeta({ noindex })` (lib/seo.ts): a page the client edits
// joins the sitemap and loses noindex on the next read.
import type { Database } from "~/server/db.server";
import { reviewSummary } from "~/server/repos/reviews.server";
import { getPagePlaceholders } from "~/server/services/site-page.server";

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
 * True per page while it still holds placeholder text (`site_page.is_placeholder`). A page
 * missing from the table, or a failed read, counts as placeholder: never index sample text.
 */
export async function contentPagePlaceholders(db: Database): Promise<PlaceholderFlags> {
  try {
    const stored = await getPagePlaceholders(db);
    return Object.fromEntries((Object.keys(ALL_PLACEHOLDER) as ContentPageKey[]).map((key) => [key, stored[key] ?? true])) as PlaceholderFlags;
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "page_placeholders_read_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return ALL_PLACEHOLDER;
  }
}

/** Unprefixed sitemap paths for these flags: the fixed pages, then content pages the client has edited. */
export function indexablePaths(flags: PlaceholderFlags): string[] {
  const edited = (Object.keys(CONTENT_PAGE_PATHS) as ContentPageKey[]).filter((key) => !flags[key]).map((key) => CONTENT_PAGE_PATHS[key]);
  return [...ALWAYS_INDEXED_PATHS, ...edited];
}

/** The Reviews page is indexed (and in the sitemap) once one review is approved (S-267 AC5, AC6). */
export const REVIEWS_PATH = "/reviews";

async function hasApprovedReviews(db: Database): Promise<boolean> {
  try {
    return (await reviewSummary(db)).count > 0;
  } catch {
    return false;
  }
}

/** Unprefixed paths for /sitemap.xml. */
export async function sitemapPaths(db: Database): Promise<string[]> {
  const [flags, reviews] = await Promise.all([contentPagePlaceholders(db), hasApprovedReviews(db)]);
  return [...indexablePaths(flags), ...(reviews ? [REVIEWS_PATH] : [])];
}
