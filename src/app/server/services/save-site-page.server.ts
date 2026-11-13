// Admin Pages save (E-13 S-246, S-247, FR-078): one page's text, photos and (Workshops) next
// workshop in one versioned write. Photos follow the S-047 rules: a path the page already has
// is kept as stored; any other must be issued to this admin for this page and editor session
// (`site/pages/<key>/<adminId>/<uploadSessionId>/`), used by no page, and stored in the bucket
// as a JPEG, PNG or WebP of at most 1 MB by its first bytes; its smaller copies (S-276) are
// checked the same way and their widths stored with the row. The row is locked and its
// version compared (stale → PAGE_CHANGED, nothing saved). The first save clears
// `is_placeholder`. Removed photo files are deleted after commit (or queued in storage_purge).
import { eq, inArray } from "drizzle-orm";
import { sitePage, sitePagePhoto } from "~/db/schema";
import { PAGE_PHOTO_LIMITS, type PageEvent, type SitePageKey, isIssuedPagePhotoPath } from "~/domain/site-pages";
import type { AfterResponse } from "~/server/after-response.server";
import type { PagePhotoInput, SitePageInput } from "~/server/contracts/site-pages";
import type { Database } from "~/server/db.server";
import type { StorageGateway, UploadGateway } from "~/server/storage.server";
import { type VerifiedPhotos, checkNewPhoto } from "./product-photos.server";
import { clearSitePageCache } from "./site-page.server";
import { removePhotos } from "./storage-cleanup.server";

export type SaveSitePageResult =
  | { ok: true; version: number }
  | { ok: false; code: "PAGE_CHANGED" | "NOT_FOUND" }
  | { ok: false; code: "UPLOAD_REJECTED"; fields: Record<string, string> };

export interface SaveSitePageContext {
  adminId: string;
  now: Date;
  /** The editor's upload sessions (page photos, workshop photo). */
  uploadSessionIds: string[];
  uploads?: UploadGateway | null;
  storage?: StorageGateway | null;
  after?: AfterResponse;
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Role = "page" | "event";
type Row = { role: Role; photo: PagePhotoInput; slot: number; field: string };

/** Every posted photo with its role, slot and the form field a refusal points at. */
function postedRows(input: SitePageInput): Row[] {
  const rows: Row[] = input.photos.map((photo, slot) => ({ role: "page", photo, slot, field: `photos.${slot}` }));
  if (input.event?.photo) rows.push({ role: "event", photo: input.event.photo, slot: 0, field: "eventPhoto" });
  return rows;
}

async function storedPaths(db: Database | Tx, key: SitePageKey): Promise<Map<string, { width: number; height: number; variantWidths: number[] }>> {
  const rows = await db
    .select({ path: sitePagePhoto.storagePath, width: sitePagePhoto.width, height: sitePagePhoto.height, variantWidths: sitePagePhoto.variantWidths })
    .from(sitePagePhoto)
    .where(eq(sitePagePhoto.pageKey, key));
  return new Map(rows.map((r) => [r.path, { width: r.width, height: r.height, variantWidths: r.variantWidths }]));
}

type PhotoChecks = { rejected: string[]; verified: VerifiedPhotos };

/** Fields of new photos that fail the S-047 checks (AC6), and the new ones that pass with their variants (S-276). */
async function checkPhotos(db: Database, key: SitePageKey, rows: Row[], known: Map<string, unknown>, context: SaveSitePageContext): Promise<PhotoChecks> {
  const fresh = rows.filter((r) => !known.has(r.photo.path));
  if (fresh.length === 0) return { rejected: [], verified: new Map() };
  const { uploads, uploadSessionIds, adminId } = context;
  const issued = (r: Row) => uploads && uploadSessionIds.some((session) => isIssuedPagePhotoPath(r.photo.path, key, adminId, session));
  const used = await db
    .select({ path: sitePagePhoto.storagePath })
    .from(sitePagePhoto)
    .where(inArray(sitePagePhoto.storagePath, fresh.map((r) => r.photo.path)));
  const usedPaths = new Set(used.map((u) => u.path));
  const checks = await Promise.all(fresh.map(async (r) => (issued(r) && !usedPaths.has(r.photo.path) ? checkNewPhoto(uploads!, r.photo) : null)));
  return {
    rejected: fresh.filter((_, i) => !checks[i]).map((r) => r.field),
    verified: new Map(fresh.flatMap((r, i) => (checks[i] ? [[r.photo.path, checks[i]] as const] : []))),
  };
}

function storedEvent(input: SitePageInput): PageEvent | null {
  if (!input.event) return null;
  const { title, date, seats, text } = input.event;
  return { title, date, seats, text };
}

async function writePhotos(tx: Tx, key: SitePageKey, rows: Row[], verified: VerifiedPhotos): Promise<string[] | null> {
  const current = await storedPaths(tx, key);
  if (rows.some((r) => !current.has(r.photo.path) && !verified.has(r.photo.path))) return null;
  await tx.delete(sitePagePhoto).where(eq(sitePagePhoto.pageKey, key));
  if (rows.length > 0) {
    await tx.insert(sitePagePhoto).values(
      rows.map(({ role, photo, slot }) => {
        const kept = current.get(photo.path);
        const variantWidths = [...(kept?.variantWidths ?? verified.get(photo.path) ?? [])];
        return { pageKey: key, role, storagePath: photo.path, width: kept?.width ?? photo.width, height: kept?.height ?? photo.height, variantWidths, altEn: photo.alt.en, altFr: photo.alt.fr ?? null, sortOrder: slot };
      }),
    );
  }
  const keep = new Set(rows.map((r) => r.photo.path));
  return [...current.keys()].filter((path) => !keep.has(path));
}

export async function saveSitePage(db: Database, key: SitePageKey, version: number, input: SitePageInput, context: SaveSitePageContext): Promise<SaveSitePageResult> {
  const rows = postedRows(input);
  const pagePaths = rows.map((r) => r.photo.path);
  if (input.photos.length > PAGE_PHOTO_LIMITS[key] || new Set(pagePaths).size !== pagePaths.length) return { ok: false, code: "UPLOAD_REJECTED", fields: { photos: "rejected" } };
  const known = await storedPaths(db, key);
  const { rejected, verified } = await checkPhotos(db, key, rows, known, context);
  if (rejected.length > 0) return { ok: false, code: "UPLOAD_REJECTED", fields: Object.fromEntries(rejected.map((field) => [field, "rejected"])) };
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx.select({ version: sitePage.version }).from(sitePage).where(eq(sitePage.key, key)).for("update");
    if (!row) return { code: "NOT_FOUND" as const };
    if (row.version !== version) return { code: "PAGE_CHANGED" as const };
    const removed = await writePhotos(tx, key, rows, verified);
    // A photo another save just removed is not linked unchecked: the editor reloads.
    if (!removed) return { code: "PAGE_CHANGED" as const };
    await tx
      .update(sitePage)
      .set({ content: input.content, event: storedEvent(input), isPlaceholder: false, version: row.version + 1, updatedAt: context.now, updatedBy: context.adminId })
      .where(eq(sitePage.key, key));
    return { code: "OK" as const, version: row.version + 1, removed };
  });
  if (saved.code !== "OK") return { ok: false, code: saved.code };
  clearSitePageCache();
  console.log(JSON.stringify({ level: "info", event: "site_page_saved", key, photos: rows.length, removed: saved.removed.length }));
  if (saved.removed.length > 0) {
    const cleanUp = () => removePhotos(db, context.storage ?? null, saved.removed);
    if (context.after) context.after.defer("remove-photos", cleanUp);
    else await cleanUp();
  }
  return { ok: true, version: saved.version };
}
