import { cleanVariantWidths, variantPath, variantSize } from "~/domain/upload";

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

/**
 * A photo as a page renders it (S-276): the original's URL and size, and, when smaller copies
 * exist, a `srcSet` the browser picks from with the `sizes` of the place it shows in. A photo
 * without variants has no `srcSet` and loads the original (the safe fallback).
 */
export interface WebPhoto {
  url: string;
  width: number;
  height: number;
  srcSet?: string;
  /** URL of the smallest copy, for thumbnails (the original when there is none). */
  thumbUrl?: string;
}

export function webPhoto(storagePath: string, width: number, height: number, variants: readonly number[] | null | undefined, supabaseUrl: string): WebPhoto {
  const url = publicImageUrl(storagePath, supabaseUrl);
  const widths = storagePath.startsWith("/") ? [] : cleanVariantWidths(variants, width);
  if (widths.length === 0) return { url, width, height };
  const urls = widths.map((w) => ({ url: publicImageUrl(variantPath(storagePath, w), supabaseUrl), width: variantSize(width, height, w).width }));
  const srcSet = [...urls, { url, width }].map((s) => `${s.url} ${s.width}w`).join(", ");
  return { url, width, height, srcSet, thumbUrl: urls[0]!.url };
}

/** URL of the smallest stored copy of a photo (admin thumbnails), else the original. */
export function thumbnailUrl(storagePath: string, width: number, variants: readonly number[] | null | undefined, supabaseUrl: string): string {
  const photo = webPhoto(storagePath, width, width, variants, supabaseUrl);
  return photo.thumbUrl ?? photo.url;
}
