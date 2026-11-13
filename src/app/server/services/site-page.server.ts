// Public read of a brand page (E-13 S-245, FR-078): text and photos of one page in the
// visitor's language, English per field when French is blank (NFR-007). One query (page
// left-joined with its photos), cached per isolate like Settings (60 s, cleared by a save in
// that isolate). Only published columns leave here (never `updated_by`). Text is returned as
// stored: pages render it only through `PlainText` (escaped, paragraphs kept).
import { type SQL, asc, eq, sql } from "drizzle-orm";
import { galleryPhoto, sitePage, sitePagePhoto } from "~/db/schema";
import { type PageContent, type PageEvent, SITE_PAGE_FIELDS, type SitePageField, type SitePageKey, isPagePhotoPath } from "~/domain/site-pages";
import { localized } from "~/i18n/localized";
import { webPhoto } from "~/lib/images";
import type { Locale } from "~/lib/locale";
import type { Database } from "~/server/db.server";
import { SETTINGS_TTL_MS, type TtlCache, createTtlCache } from "~/server/settings-cache.server";

export interface StoredPagePhoto {
  role: "page" | "event";
  path: string;
  width: number;
  height: number;
  /** Widths of the stored smaller copies (S-276); absent in copies cached before. */
  variantWidths?: number[];
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
  /** Smaller copies for `srcset` (S-276); absent when only the original exists. */
  srcSet?: string;
  thumbUrl?: string;
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

/** The page row left-joined with its photos; `extra` adds columns to the same statement. */
function selectStoredPage<E extends Record<string, SQL>>(db: Database, key: SitePageKey, extra: E) {
  return db
    .select({
      content: sitePage.content,
      event: sitePage.event,
      isPlaceholder: sitePage.isPlaceholder,
      role: sitePagePhoto.role,
      path: sitePagePhoto.storagePath,
      width: sitePagePhoto.width,
      height: sitePagePhoto.height,
      variantWidths: sitePagePhoto.variantWidths,
      altEn: sitePagePhoto.altEn,
      altFr: sitePagePhoto.altFr,
      ...extra,
    })
    .from(sitePage)
    .leftJoin(sitePagePhoto, eq(sitePagePhoto.pageKey, sitePage.key))
    .where(eq(sitePage.key, key))
    .orderBy(asc(sitePagePhoto.role), asc(sitePagePhoto.sortOrder));
}

interface StoredPageRow {
  content: PageContent;
  event: PageEvent | null;
  isPlaceholder: boolean;
  role: string | null;
  path: string | null;
  width: number | null;
  height: number | null;
  variantWidths?: number[] | null;
  altEn: string | null;
  altFr: string | null;
}

function storedPageFrom(key: SitePageKey, rows: StoredPageRow[]): StoredSitePage | null {
  const first = rows[0];
  if (!first) return null;
  const photos: StoredPagePhoto[] = rows
    .filter((r) => r.path !== null && r.width !== null && r.height !== null && (r.role === "page" || r.role === "event"))
    .map((r) => ({ role: r.role as "page" | "event", path: r.path!, width: r.width!, height: r.height!, variantWidths: r.variantWidths ?? [], alt: { en: r.altEn ?? "", fr: r.altFr } }));
  return { key, content: first.content, event: first.event, isPlaceholder: first.isPlaceholder, photos };
}

/** One query: the page and its photos in role, then slot order. */
export async function readStoredSitePage(db: Database, key: SitePageKey): Promise<StoredSitePage | null> {
  return storedPageFrom(key, await selectStoredPage(db, key, {}));
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
  return { ...webPhoto(photo.path, photo.width, photo.height, photo.variantWidths, supabaseUrl), alt: localized(photo.alt, locale) };
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
  /** For "Request something similar" (E-08 S-154); absent in copies cached before. */
  id?: string;
  path: string;
  width: number;
  height: number;
  /** Widths of the stored smaller copies (S-276); absent in copies cached before. */
  variantWidths?: number[];
  captionEn: string | null;
  captionFr: string | null;
  occasion: string | null;
}

export interface GalleryPhotoView {
  /** The gallery photo id (E-08 S-154: the request form's ?fromGallery=); null in an old cached copy. */
  id: string | null;
  url: string;
  width: number;
  height: number;
  srcSet?: string;
  thumbUrl?: string;
  alt: string;
  caption: string | null;
}

const galleryCache = createTtlCache<StoredGalleryPhoto[]>(SETTINGS_TTL_MS, () => Date.now());

export type GalleryRead = { ok: true; photos: GalleryPhotoView[] } | { ok: false; code: "PAGE_UNAVAILABLE" };

function galleryView(photo: StoredGalleryPhoto, locale: Locale, supabaseUrl: string, fallbackAlt: string): GalleryPhotoView {
  const caption = photo.captionEn && photo.captionEn.trim() !== "" ? localized({ en: photo.captionEn, fr: photo.captionFr }, locale) : null;
  const occasion = photo.occasion && photo.occasion.trim() !== "" ? photo.occasion : null;
  return { id: photo.id ?? null, ...webPhoto(photo.path, photo.width, photo.height, photo.variantWidths, supabaseUrl), alt: caption ?? occasion ?? fallbackAlt, caption };
}

/** Gallery rows as JSON in sort order, for a column of another statement (S-254 query merge). */
const galleryJson = sql<StoredGalleryPhoto[] | string | null>`(
  select json_agg(json_build_object('id', g.id, 'path', g.storage_path, 'width', g.width, 'height', g.height, 'variantWidths', g.variant_widths,
    'captionEn', g.caption_en, 'captionFr', g.caption_fr, 'occasion', g.occasion) order by g.sort_order, g.created_at)
  from ${galleryPhoto} g
)`;

function readGalleryRows(db: Database): Promise<StoredGalleryPhoto[]> {
  return db
    .select({
      id: galleryPhoto.id,
      path: galleryPhoto.storagePath,
      width: galleryPhoto.width,
      height: galleryPhoto.height,
      variantWidths: galleryPhoto.variantWidths,
      captionEn: galleryPhoto.captionEn,
      captionFr: galleryPhoto.captionFr,
      occasion: galleryPhoto.occasion,
    })
    .from(galleryPhoto)
    .orderBy(asc(galleryPhoto.sortOrder), asc(galleryPhoto.createdAt));
}

function galleryRead(rows: StoredGalleryPhoto[], locale: Locale, supabaseUrl: string, fallbackAlt: string): GalleryRead {
  return { ok: true, photos: rows.filter((r) => r.width > 0 && r.height > 0).map((r) => galleryView(r, locale, supabaseUrl, fallbackAlt)) };
}

const logGalleryFailure = (error: unknown) =>
  console.log(JSON.stringify({ level: "warn", event: "gallery_read_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));

/** Every gallery photo in sort order, localised; `fallbackAlt` names a photo with no caption or occasion. */
export async function getGalleryPhotos(db: Database, locale: Locale, supabaseUrl: string, fallbackAlt: string): Promise<GalleryRead> {
  try {
    return galleryRead(await galleryCache.get(() => readGalleryRows(db)), locale, supabaseUrl, fallbackAlt);
  } catch (error) {
    logGalleryFailure(error);
    return { ok: false, code: "PAGE_UNAVAILABLE" };
  }
}

/**
 * The Gallery page (S-250): its text and the gallery photos. On a cold isolate both come from
 * ONE statement (S-254: one database round trip instead of two) and fill both caches.
 */
export async function getGalleryPage(db: Database, locale: Locale, supabaseUrl: string, fallbackAlt: string): Promise<{ read: SitePageRead; gallery: GalleryRead }> {
  let merged: StoredGalleryPhoto[] | undefined;
  try {
    const stored = await cacheFor("gallery").get(async () => {
      const rows = await selectStoredPage(db, "gallery", { gallery: galleryJson });
      const json = rows[0]?.gallery;
      merged = (typeof json === "string" ? (JSON.parse(json) as StoredGalleryPhoto[]) : json) ?? [];
      return storedPageFrom("gallery", rows);
    });
    const read: SitePageRead = stored ? { ok: true, page: localizeSitePage(stored, locale, supabaseUrl) } : { ok: false, code: "PAGE_UNAVAILABLE" };
    const rows = await galleryCache.get(async () => merged ?? (await readGalleryRows(db)));
    return { read, gallery: galleryRead(rows, locale, supabaseUrl, fallbackAlt) };
  } catch (error) {
    logGalleryFailure(error);
    return { read: { ok: false, code: "PAGE_UNAVAILABLE" }, gallery: { ok: false, code: "PAGE_UNAVAILABLE" } };
  }
}
