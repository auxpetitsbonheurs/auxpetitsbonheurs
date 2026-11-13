// Custom request reads (E-08): the gallery photo a form starts with (S-154), the request and its
// photos for the admin order screen (S-155) and the quote the tracking page shows (S-158).
import { eq } from "drizzle-orm";
import { galleryPhoto } from "~/db/schema";
import { webPhoto } from "~/lib/images";
import type { Executor } from "~/server/db.server";

/** A gallery photo to pre-attach, or null when the id is unknown (S-154 AC3: ignored, no error). */
export async function findGalleryAttachment(db: Executor, id: string, supabaseUrl: string): Promise<{ id: string; url: string } | null> {
  const [row] = await db
    .select({ id: galleryPhoto.id, storagePath: galleryPhoto.storagePath, width: galleryPhoto.width, height: galleryPhoto.height, variantWidths: galleryPhoto.variantWidths })
    .from(galleryPhoto)
    .where(eq(galleryPhoto.id, id))
    .limit(1);
  if (!row) return null;
  const photo = webPhoto(row.storagePath, row.width, row.height, row.variantWidths, supabaseUrl);
  // The smallest stored copy is enough for a 160 px tile.
  return { id: row.id, url: photo.thumbUrl ?? photo.url };
}
