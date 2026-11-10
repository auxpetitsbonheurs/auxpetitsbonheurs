/** Public bucket for product, gallery, promotion and hero photos (architecture: files). */
export const PUBLIC_IMAGES_BUCKET = "public-images";

/**
 * URL of a public photo. Storage paths resolve to the Supabase public CDN URL; a path
 * starting with "/" is a bundled static asset (sample data only) and is used as is.
 */
export function publicImageUrl(storagePath: string, supabaseUrl: string): string {
  if (storagePath.startsWith("/")) return storagePath;
  const base = supabaseUrl.replace(/\/+$/, "");
  const path = storagePath.split("/").map(encodeURIComponent).join("/");
  return `${base}/storage/v1/object/public/${PUBLIC_IMAGES_BUCKET}/${path}`;
}
