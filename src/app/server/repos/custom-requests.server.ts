// Custom request reads (E-08): the gallery photo a form starts with (S-154), the request and its
// photos for the admin order screen (S-155) and the quote the tracking page shows (S-158).
import { eq, sql } from "drizzle-orm";
import { galleryPhoto } from "~/db/schema";
import { webPhoto } from "~/lib/images";
import type { Executor } from "~/server/db.server";

export interface RequestPhotoRow {
  storagePath: string;
  sortOrder: number;
  /** Set when the photo is a gallery photo (public bucket), referenced by "Request something similar". */
  fromGallery: boolean;
}

export interface CustomRequestRow {
  occasion: string | null;
  servings: number | null;
  flavours: string | null;
  theme: string | null;
  cakeText: string | null;
  budgetRs: number | null;
  details: string | null;
  quote: { amountRs: number; note: string | null; expiresOn: string } | null;
  photos: RequestPhotoRow[];
}

type RequestJson = Omit<CustomRequestRow, "quote" | "photos"> & {
  quoteAmountRs: number | null;
  quoteNote: string | null;
  quoteExpiresOn: string | null;
  photos: RequestPhotoRow[] | string;
};

/** The request behind an order of source custom_request, with its photos in order, in one query; null for other orders. */
export async function findCustomRequest(db: Executor, orderId: string): Promise<CustomRequestRow | null> {
  const { rows } = (await db.execute(sql`
    select cr.occasion, cr.servings, cr.flavours, cr.theme, cr.cake_text as "cakeText", cr.budget_rs as "budgetRs", cr.details,
      cr.quote_amount_rs as "quoteAmountRs", cr.quote_note as "quoteNote", to_char(cr.quote_expires_on, 'YYYY-MM-DD') as "quoteExpiresOn",
      coalesce((select json_agg(json_build_object('storagePath', p.storage_path, 'sortOrder', p.sort_order, 'fromGallery', p.source_gallery_photo_id is not null) order by p.sort_order)
        from custom_request_photo p where p.order_id = cr.order_id), '[]'::json) as photos
    from custom_request cr where cr.order_id = ${orderId}::uuid
  `)) as unknown as { rows: RequestJson[] };
  const row = rows[0];
  if (!row) return null;
  const { quoteAmountRs, quoteNote, quoteExpiresOn, photos, ...fields } = row;
  return {
    ...fields,
    quote: quoteAmountRs !== null && quoteExpiresOn !== null ? { amountRs: quoteAmountRs, note: quoteNote, expiresOn: quoteExpiresOn } : null,
    photos: typeof photos === "string" ? (JSON.parse(photos) as RequestPhotoRow[]) : photos,
  };
}

/** The quote a tracking page shows (S-158): amount, note and expiry, or null before one is sent. */
export async function findQuote(db: Executor, orderId: string): Promise<CustomRequestRow["quote"]> {
  const { rows } = (await db.execute(sql`
    select quote_amount_rs as "amountRs", quote_note as note, to_char(quote_expires_on, 'YYYY-MM-DD') as "expiresOn"
    from custom_request where order_id = ${orderId}::uuid and quote_amount_rs is not null
  `)) as unknown as { rows: { amountRs: number; note: string | null; expiresOn: string }[] };
  return rows[0] ?? null;
}

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
