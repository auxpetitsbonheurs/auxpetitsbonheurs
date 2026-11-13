// Admin reads of the brand pages (E-13 S-246, S-247): the Pages list and one page for its
// editor (all stored fields, photos with both alt texts, the version for the save).
import { asc, eq } from "drizzle-orm";
import { admin, sitePage, sitePagePhoto } from "~/db/schema";
import { type PageContent, type PageEvent, SITE_PAGE_KEYS, type SitePageKey } from "~/domain/site-pages";
import type { Database } from "~/server/db.server";

export interface SitePageListRow {
  key: SitePageKey;
  isPlaceholder: boolean;
  updatedAt: Date;
  updatedByName: string | null;
}

/** The five pages in the editor's order (SITE_PAGE_KEYS). */
export async function listSitePages(db: Database): Promise<SitePageListRow[]> {
  const rows = await db
    .select({ key: sitePage.key, isPlaceholder: sitePage.isPlaceholder, updatedAt: sitePage.updatedAt, updatedByName: admin.name })
    .from(sitePage)
    .leftJoin(admin, eq(admin.id, sitePage.updatedBy));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return SITE_PAGE_KEYS.flatMap((key) => {
    const row = byKey.get(key);
    return row ? [{ key, isPlaceholder: row.isPlaceholder, updatedAt: row.updatedAt, updatedByName: row.updatedByName }] : [];
  });
}

export interface EditorPhoto {
  role: "page" | "event";
  path: string;
  width: number;
  height: number;
  /** Widths of the stored smaller copies (S-276): the editor's tiles load the smallest. */
  variantWidths: number[];
  alt: { en: string; fr: string };
}

export interface SitePageForEditor {
  key: SitePageKey;
  content: PageContent;
  event: PageEvent | null;
  isPlaceholder: boolean;
  version: number;
  photos: EditorPhoto[];
}

export async function readSitePageForEditor(db: Database, key: SitePageKey): Promise<SitePageForEditor | null> {
  const [page] = await db
    .select({ content: sitePage.content, event: sitePage.event, isPlaceholder: sitePage.isPlaceholder, version: sitePage.version })
    .from(sitePage)
    .where(eq(sitePage.key, key));
  if (!page) return null;
  const photos = await db
    .select({ role: sitePagePhoto.role, path: sitePagePhoto.storagePath, width: sitePagePhoto.width, height: sitePagePhoto.height, variantWidths: sitePagePhoto.variantWidths, altEn: sitePagePhoto.altEn, altFr: sitePagePhoto.altFr })
    .from(sitePagePhoto)
    .where(eq(sitePagePhoto.pageKey, key))
    .orderBy(asc(sitePagePhoto.role), asc(sitePagePhoto.sortOrder));
  return {
    key,
    ...page,
    photos: photos.map((p) => ({ role: p.role === "event" ? "event" : "page", path: p.path, width: p.width, height: p.height, variantWidths: p.variantWidths, alt: { en: p.altEn, fr: p.altFr ?? "" } })),
  };
}
