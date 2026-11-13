// Backfill of the smaller photo copies (S-276) for photos stored before the editor made them.
// Node only (`npm run backfill:photo-variants`, run by the manual `photo-variants` workflow on
// STAGING; never the Worker, which must not resize images). For every stored photo whose row
// lacks a variant width it should have: download the original, make the missing copies with
// sharp in the original's type, upload each through a signed upload URL beside the original
// (`<stem>-<width>w.<ext>`), then record the widths that pass the same Storage checks as an
// editor save (storedVariantWidths). Idempotent: a copy already stored is reused, a row that
// is complete is skipped, and a row changed meanwhile (other path) is left alone.
import { and, eq, sql } from "drizzle-orm";
import { galleryPhoto, productPhoto, settings, sitePagePhoto } from "~/db/schema";
import { type PhotoVariantWidth, type UploadType, sniffImageType, typeOfPath, variantPath, variantSize, variantWidthsFor } from "~/domain/upload";
import { PUBLIC_IMAGES_BUCKET } from "~/lib/images";
import type { Database } from "~/server/db.server";
import type { MenuPhotoUploads } from "./menu-photos.server";
import { storedVariantWidths } from "./product-photos.server";

export class BackfillRefused extends Error {
  readonly code = "BACKFILL_REFUSED";
}

/** Staging only (S-276 AC8): any other APP_ENV is refused before anything is read. */
export function assertBackfillAllowed(appEnv: string | undefined): void {
  if (appEnv !== "staging") {
    throw new BackfillRefused(`backfill:photo-variants runs only with APP_ENV=staging (got ${appEnv === undefined ? "nothing" : JSON.stringify(appEnv)}); nothing was written`);
  }
}

export interface BackfillIo {
  uploads: MenuPhotoUploads;
  /** The original's bytes (public CDN), or null when it is not there. */
  download(path: string): Promise<Uint8Array | null>;
  /** The original's pixel size, read from its bytes. */
  measure(bytes: Uint8Array): Promise<{ width: number; height: number }>;
  /** `bytes` drawn at `width` x `height`, encoded as `type`, metadata dropped. */
  resize(bytes: Uint8Array, width: number, height: number, type: UploadType): Promise<Uint8Array>;
}

type Source = "product_photo" | "gallery_photo" | "site_page_photo" | "settings.hero" | "settings.about";

/** One stored photo to look at. Settings images have no stored size (null). */
export interface BackfillPhoto {
  source: Source;
  id: string;
  path: string;
  width: number | null;
  variantWidths: number[];
}

export type BackfillOutcome = "up to date" | "made" | "skipped" | "failed";

export interface BackfillLine {
  source: Source;
  /** File name only: enough to find it, nothing private. */
  file: string;
  outcome: BackfillOutcome;
  widths: number[];
  reason?: string;
}

/** Every stored photo of every table that renders photos (bundled "/images/…" samples left out). */
export async function listBackfillPhotos(db: Database): Promise<BackfillPhoto[]> {
  const [products, gallery, pages, [row]] = await Promise.all([
    db.select({ id: productPhoto.id, path: productPhoto.storagePath, width: productPhoto.width, variantWidths: productPhoto.variantWidths }).from(productPhoto),
    db.select({ id: galleryPhoto.id, path: galleryPhoto.storagePath, width: galleryPhoto.width, variantWidths: galleryPhoto.variantWidths }).from(galleryPhoto),
    db.select({ id: sitePagePhoto.id, path: sitePagePhoto.storagePath, width: sitePagePhoto.width, variantWidths: sitePagePhoto.variantWidths }).from(sitePagePhoto),
    db.select({ hero: settings.hero, heroImageVariants: settings.heroImageVariants, aboutImagePath: settings.aboutImagePath, aboutImageVariants: settings.aboutImageVariants }).from(settings).where(eq(settings.id, 1)),
  ]);
  const settingsPhotos: BackfillPhoto[] = [];
  if (row?.hero?.imagePath) settingsPhotos.push({ source: "settings.hero", id: "1", path: row.hero.imagePath, width: null, variantWidths: row.heroImageVariants });
  if (row?.aboutImagePath) settingsPhotos.push({ source: "settings.about", id: "1", path: row.aboutImagePath, width: null, variantWidths: row.aboutImageVariants });
  const tagged = (source: Source, rows: Omit<BackfillPhoto, "source">[]) => rows.map((r) => ({ ...r, source }));
  return [...tagged("product_photo", products), ...tagged("gallery_photo", gallery), ...tagged("site_page_photo", pages), ...settingsPhotos].filter((p) => !p.path.startsWith("/"));
}

/** Records `widths` on the photo's row, only while it still holds `path`. */
async function recordWidths(db: Database, photo: BackfillPhoto, widths: number[]): Promise<void> {
  const value = widths;
  switch (photo.source) {
    case "product_photo":
      await db.update(productPhoto).set({ variantWidths: value }).where(and(eq(productPhoto.id, photo.id), eq(productPhoto.storagePath, photo.path)));
      return;
    case "gallery_photo":
      await db.update(galleryPhoto).set({ variantWidths: value }).where(and(eq(galleryPhoto.id, photo.id), eq(galleryPhoto.storagePath, photo.path)));
      return;
    case "site_page_photo":
      await db.update(sitePagePhoto).set({ variantWidths: value }).where(and(eq(sitePagePhoto.id, photo.id), eq(sitePagePhoto.storagePath, photo.path)));
      return;
    case "settings.hero":
      await db.update(settings).set({ heroImageVariants: value }).where(and(eq(settings.id, 1), sql`${settings.hero}->>'imagePath' = ${photo.path}`));
      return;
    case "settings.about":
      await db.update(settings).set({ aboutImageVariants: value }).where(and(eq(settings.id, 1), eq(settings.aboutImagePath, photo.path)));
  }
}

/** Makes and uploads the copies not already stored; Storage failures throw. */
async function storeMissing(io: BackfillIo, path: string, bytes: Uint8Array, size: { width: number; height: number }, type: UploadType, widths: PhotoVariantWidth[]): Promise<void> {
  for (const width of widths) {
    const target = variantPath(path, width);
    if (await io.uploads.inspect(PUBLIC_IMAGES_BUCKET, target)) continue; // stored by an earlier run (checked below)
    const { height } = variantSize(size.width, size.height, width);
    const copy = await io.resize(bytes, width, height, type);
    const signed = await io.uploads.signUpload(PUBLIC_IMAGES_BUCKET, target);
    await io.uploads.put(signed.signedUrl, copy, type);
  }
}

const line = (photo: BackfillPhoto, outcome: BackfillOutcome, widths: number[], reason?: string): BackfillLine => ({
  source: photo.source,
  file: photo.path.split("/").pop() ?? "",
  outcome,
  widths,
  ...(reason ? { reason } : {}),
});

/** One photo: complete rows are left alone; otherwise the copies are made, checked and recorded. */
export async function backfillPhoto(db: Database, io: BackfillIo, photo: BackfillPhoto): Promise<BackfillLine> {
  const type = typeOfPath(photo.path);
  if (type !== "image/webp" && type !== "image/jpeg") return line(photo, "skipped", photo.variantWidths, "not a WebP or JPEG photo");
  const have = new Set(photo.variantWidths);
  if (photo.width !== null && variantWidthsFor(photo.width).every((w) => have.has(w))) return line(photo, "up to date", photo.variantWidths);
  const bytes = await io.download(photo.path);
  if (!bytes) return line(photo, "skipped", photo.variantWidths, "original not found");
  if (sniffImageType(bytes.subarray(0, 16)) !== type) return line(photo, "skipped", photo.variantWidths, "original is not the type its name says");
  const size = await io.measure(bytes);
  const width = photo.width ?? size.width;
  const wanted = variantWidthsFor(width);
  if (wanted.every((w) => have.has(w))) return line(photo, "up to date", photo.variantWidths);
  await storeMissing(io, photo.path, bytes, size, type, wanted.filter((w) => !have.has(w)));
  const stored = await storedVariantWidths(io.uploads, photo.path, width);
  if (!stored) return line(photo, "failed", photo.variantWidths, "a stored copy failed the checks");
  await recordWidths(db, photo, stored);
  return line(photo, "made", stored);
}

export interface BackfillReport {
  lines: BackfillLine[];
  made: number;
  upToDate: number;
  skipped: number;
  failed: number;
}

/** Every photo, one after the other (a staging bucket holds a few dozen). */
export async function backfillPhotoVariants(db: Database, io: BackfillIo, appEnv: string | undefined): Promise<BackfillReport> {
  assertBackfillAllowed(appEnv);
  const lines: BackfillLine[] = [];
  for (const photo of await listBackfillPhotos(db)) {
    try {
      lines.push(await backfillPhoto(db, io, photo));
    } catch (error) {
      lines.push(line(photo, "failed", photo.variantWidths, error instanceof Error ? error.message.slice(0, 120) : "unknown error"));
    }
  }
  const count = (outcome: BackfillOutcome) => lines.filter((l) => l.outcome === outcome).length;
  return { lines, made: count("made"), upToDate: count("up to date"), skipped: count("skipped"), failed: count("failed") };
}
