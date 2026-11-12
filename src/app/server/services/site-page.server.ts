// Public read of a brand page (E-13 S-245, FR-078): text and photos of one page in the
// visitor's language, English per field when French is blank (NFR-007). One query (page
// left-joined with its photos), cached per isolate like Settings (60 s, cleared by a save in
// that isolate). Only published columns leave here (never `updated_by`). Text is returned as
// stored: pages render it only through `PlainText` (escaped, paragraphs kept).
import { asc, eq } from "drizzle-orm";
import { galleryPhoto, sitePage, sitePagePhoto } from "~/db/schema";
import { type PageContent, type PageEvent, SITE_PAGE_FIELDS, type SitePageField, type SitePageKey, isPagePhotoPath } from "~/domain/site-pages";
import { localized } from "~/i18n/localized";
import { publicImageUrl } from "~/lib/images";
import type { Locale } from "~/lib/locale";
import type { Database } from "~/server/db.server";
import { SETTINGS_TTL_MS, type TtlCache, createTtlCache } from "~/server/settings-cache.server";

export interface StoredPagePhoto {
  role: "page" | "event";
  path: string;
  width: number;
  height: number;
  alt: { en: string; fr: string | null };
}

/** The page as stored, minus `updated_by`: what the cache keeps (language-free). */
export interface StoredSitePage {
  key: SitePageKey;
  content: PageContent;
  event: PageEvent | null;
  isPlaceholder: boolean;
  photos: StoredPagePhoto[];
}

export interface PagePhoto {
  url: string;
  width: number;
  height: number;
  alt: string;
}

export interface PublicSitePage {
  key: SitePageKey;
  isPlaceholder: boolean;
  /** Field → text in the locale; a field with no English text is left out. */
  text: Partial<Record<SitePageField, string>>;
  photos: PagePhoto[];
  event: { title: string; date: string; seats: number | null; text: string | null; photo: PagePhoto | null } | null;
}

export type SitePageRead = { ok: true; page: PublicSitePage } | { ok: false; code: "PAGE_UNAVAILABLE" };

/** A row is shown only when its path is a page photo of this page (or a bundled sample image). */
const usablePath = (path: string, key: SitePageKey) => path.startsWith("/images/") || isPagePhotoPath(path, key);

/** One query: the page and its photos in role, then slot order. */
export async function readStoredSitePage(db: Database, key: SitePageKey): Promise<StoredSitePage | null> {
  const rows = await db
    .select({
      content: sitePage.content,
      event: sitePage.event,
      isPlaceholder: sitePage.isPlaceholder,
      role: sitePagePhoto.role,
      path: sitePagePhoto.storagePath,
      width: sitePagePhoto.width,
      height: sitePagePhoto.height,
      altEn: sitePagePhoto.altEn,
      altFr: sitePagePhoto.altFr,
    })
    .from(sitePage)
    .leftJoin(sitePagePhoto, eq(sitePagePhoto.pageKey, sitePage.key))
    .where(eq(sitePage.key, key))
    .orderBy(asc(sitePagePhoto.role), asc(sitePagePhoto.sortOrder));
  const first = rows[0];
  if (!first) return null;
  const photos: StoredPagePhoto[] = rows
    .filter((r) => r.path !== null && r.width !== null && r.height !== null && (r.role === "page" || r.role === "event"))
    .map((r) => ({ role: r.role as "page" | "event", path: r.path!, width: r.width!, height: r.height!, alt: { en: r.altEn ?? "", fr: r.altFr } }));
  return { key, content: first.content, event: first.event, isPlaceholder: first.isPlaceholder, photos };
}

const caches = new Map<SitePageKey, TtlCache<StoredSitePage | null>>();

function cacheFor(key: SitePageKey): TtlCache<StoredSitePage | null> {
  let cache = caches.get(key);
  if (!cache) {
    cache = createTtlCache(SETTINGS_TTL_MS, () => Date.now());
    caches.set(key, cache);
  }
  return cache;
}

/** Called by the admin save (S-246 AC3): the saving isolate shows the change at once. */
export function clearSitePageCache(): void {
  for (const cache of caches.values()) cache.clear();
  galleryCache.clear();
  placeholderCache.clear();
}

const placeholderCache = createTtlCache<Partial<Record<SitePageKey, boolean>>>(SETTINGS_TTL_MS, () => Date.now());

/**
 * `is_placeholder` of every page, one query, cached like the page read (S-253 seam: the
 * sitemap and each page's noindex read it). A page missing from the table is not in the answer.
 */
export function getPagePlaceholders(db: Database): Promise<Partial<Record<SitePageKey, boolean>>> {
  return placeholderCache.get(async () => {
    const rows = await db.select({ key: sitePage.key, isPlaceholder: sitePage.isPlaceholder }).from(sitePage);
    return Object.fromEntries(rows.map((r) => [r.key, r.isPlaceholder]));
  });
}

function photoView(photo: StoredPagePhoto, locale: Locale, supabaseUrl: string): PagePhoto {
  return { url: publicImageUrl(photo.path, supabaseUrl), width: photo.width, height: photo.height, alt: localized(photo.alt, locale) };
}

/** The stored page in `locale` (S-245 AC3, AC6). Pure. */
export function localizeSitePage(stored: StoredSitePage, locale: Locale, supabaseUrl: string): PublicSitePage {
  const text: PublicSitePage["text"] = {};
  for (const field of SITE_PAGE_FIELDS[stored.key] as readonly SitePageField[]) {
    const value = stored.content[field];
    if (value && value.en.trim() !== "") text[field] = localized(value, locale);
  }
  const usable = stored.photos.filter((p) => usablePath(p.path, stored.key));
  const pagePhotos = usable.filter((p) => p.role === "page").map((p) => photoView(p, locale, supabaseUrl));
  const eventPhoto = usable.find((p) => p.role === "event");
  const event = stored.event
    ? {
        title: localized(stored.event.title, locale),
        date: stored.event.date,
        seats: stored.event.seats,
        text: stored.event.text && stored.event.text.en.trim() !== "" ? localized(stored.event.text, locale) : null,
        photo: eventPhoto ? photoView(eventPhoto, locale, supabaseUrl) : null,
      }
    : null;
  return { key: stored.key, isPlaceholder: stored.isPlaceholder, text, photos: pagePhotos, event };
}

/** The page for a customer view; a database failure is a typed error, never a thrown 500 (AC5). */
export async function getSitePage(db: Database, key: SitePageKey, locale: Locale, supabaseUrl: string): Promise<SitePageRead> {
  try {
    const stored = await cacheFor(key).get(() => readStoredSitePage(db, key));
    if (!stored) return { ok: false, code: "PAGE_UNAVAILABLE" };
    return { ok: true, page: localizeSitePage(stored, locale, supabaseUrl) };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "site_page_read_failed", key, error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return { ok: false, code: "PAGE_UNAVAILABLE" };
  }
}

// ---------------------------------------------------------------------------
// Gallery photos (S-250): the `gallery_photo` table S-054/S-055 manage, in the admin's order.

export interface StoredGalleryPhoto {
  path: string;
  width: number;
  height: number;
  captionEn: string | null;
  captionFr: string | null;
  occasion: string | null;
}

export interface GalleryPhotoView {
  url: string;
  width: number;
  height: number;
  alt: string;
  caption: string | null;
}

const galleryCache = createTtlCache<StoredGalleryPhoto[]>(SETTINGS_TTL_MS, () => Date.now());

export type GalleryRead = { ok: true; photos: GalleryPhotoView[] } | { ok: false; code: "PAGE_UNAVAILABLE" };

function galleryView(photo: StoredGalleryPhoto, locale: Locale, supabaseUrl: string, fallbackAlt: string): GalleryPhotoView {
  const caption = photo.captionEn && photo.captionEn.trim() !== "" ? localized({ en: photo.captionEn, fr: photo.captionFr }, locale) : null;
  const occasion = photo.occasion && photo.occasion.trim() !== "" ? photo.occasion : null;
  return { url: publicImageUrl(photo.path, supabaseUrl), width: photo.width, height: photo.height, alt: caption ?? occasion ?? fallbackAlt, caption };
}

/** Every gallery photo in sort order, localised; `fallbackAlt` names a photo with no caption or occasion. */
export async function getGalleryPhotos(db: Database, locale: Locale, supabaseUrl: string, fallbackAlt: string): Promise<GalleryRead> {
  try {
    const rows = await galleryCache.get(() =>
      db
        .select({
          path: galleryPhoto.storagePath,
          width: galleryPhoto.width,
          height: galleryPhoto.height,
          captionEn: galleryPhoto.captionEn,
          captionFr: galleryPhoto.captionFr,
          occasion: galleryPhoto.occasion,
        })
        .from(galleryPhoto)
        .orderBy(asc(galleryPhoto.sortOrder), asc(galleryPhoto.createdAt)),
    );
    return { ok: true, photos: rows.filter((r) => r.width > 0 && r.height > 0).map((r) => galleryView(r, locale, supabaseUrl, fallbackAlt)) };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "gallery_read_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    return { ok: false, code: "PAGE_UNAVAILABLE" };
  }
}
