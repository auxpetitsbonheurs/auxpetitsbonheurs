// The custom request part of the admin order screen (E-08 S-155, S-156, S-161): the request's
// fields, its photos as 10-minute signed URLs from the private bucket (gallery photos by their
// public URL), the current quote and the send-quote sheet's defaults. Admin pages only: the
// loader has checked the session before this runs, and no customer page ever calls it (AC4).
import { type AdminRequestPhoto, type AdminRequestView, REQUEST_PHOTOS_BUCKET, REQUEST_PHOTO_URL_SECONDS, defaultQuoteExpiry } from "~/domain/custom-request";
import { publicImageUrl } from "~/lib/images";
import type { Executor } from "~/server/db.server";
import { type CustomRequestRow, findCustomRequest } from "~/server/repos/custom-requests.server";
import type { RequestPhotoGateway } from "~/server/storage.server";

export type { AdminRequestPhoto, AdminRequestView } from "~/domain/custom-request";

async function photoUrl(photo: CustomRequestRow["photos"][number], gateway: RequestPhotoGateway | null, supabaseUrl: string): Promise<AdminRequestPhoto> {
  if (photo.fromGallery) return { url: publicImageUrl(photo.storagePath, supabaseUrl), fromGallery: true };
  if (!gateway) return { url: null, fromGallery: false };
  try {
    return { url: await gateway.signRead(REQUEST_PHOTOS_BUCKET, photo.storagePath, REQUEST_PHOTO_URL_SECONDS), fromGallery: false };
  } catch {
    console.log(JSON.stringify({ level: "warn", event: "request_photo_sign_failed" }));
    return { url: null, fromGallery: false };
  }
}

export async function adminRequestView(
  db: Executor,
  orderId: string,
  context: { photos: RequestPhotoGateway | null; supabaseUrl: string; today: string; quoteValidityDays: number },
): Promise<AdminRequestView | null> {
  const request = await findCustomRequest(db, orderId);
  if (!request) return null;
  const photos = await Promise.all(request.photos.map((photo) => photoUrl(photo, context.photos, context.supabaseUrl)));
  return { ...request, photos, quoteDefaults: { expiresOn: defaultQuoteExpiry(context.today, context.quoteValidityDays) } };
}
