// Shared frame of the brand pages (E-13 S-248, reused by S-249, S-250 and later S-252): one
// h1 with the gold rule, the editable intro and body as escaped plain text (PlainText: blank
// line = paragraph), the page photos with explicit sizes, and the page error state. Empty
// fields leave no empty block (S-248 AC3).
import { type ReactNode, useState } from "react";
import { useRouteLoaderData } from "react-router";
import type { FooterContacts } from "~/components/shell/site-footer";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { PAGE_PAIR_SIZES, PAGE_SINGLE_SIZES } from "~/lib/photo-sizes";
import { rootOrigin, seoMeta } from "~/lib/seo";
import { cn } from "~/lib/utils";
import { PlainText } from "./plain-text";

export interface PagePhotoView {
  url: string;
  width: number;
  height: number;
  /** Smaller copies (S-276); absent when only the original exists. */
  srcSet?: string;
  alt: string;
}

/** The footer's contacts (site layout loader): WhatsApp and phone for calls to action. */
export function useSiteContacts(): FooterContacts | null {
  const { locale } = useI18n();
  const layout = useRouteLoaderData(`site-${locale}`) as { contacts?: FooterContacts } | undefined;
  return layout?.contacts ?? null;
}

/**
 * A photo with its size reserved (no layout shift). A file missing in Storage hides its
 * figure instead of showing a broken image (S-245 AC6).
 */
export function PagePhoto({ photo, eager = false, className, sizes = PAGE_SINGLE_SIZES }: { photo: PagePhotoView; eager?: boolean; className?: string; sizes?: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return null;
  return (
    <figure className={cn("min-w-0", className)}>
      <img
        src={photo.url}
        srcSet={photo.srcSet}
        sizes={photo.srcSet && sizes}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        onError={() => setBroken(true)}
        className="h-auto w-full rounded-card bg-decorative object-cover"
      />
    </figure>
  );
}

export function PagePhotoGrid({ photos, firstEager = false }: { photos: PagePhotoView[]; firstEager?: boolean }) {
  if (photos.length === 0) return null;
  return (
    <div className={cn("grid gap-4", photos.length > 1 && "sm:grid-cols-2")}>
      {photos.map((photo, index) => (
        <PagePhoto key={photo.url} photo={photo} eager={firstEager && index === 0} sizes={photos.length > 1 ? PAGE_PAIR_SIZES : PAGE_SINGLE_SIZES} />
      ))}
    </div>
  );
}

export interface SitePageViewProps {
  title: string;
  intro?: string;
  body?: string;
  photos?: PagePhotoView[];
  /** Sections after the body (next workshop, gallery grid, call to action). */
  children?: ReactNode;
}

export function SitePageView({ title, intro, body, photos = [], children }: SitePageViewProps) {
  return (
    <article className="mx-auto grid max-w-3xl gap-8 pt-2">
      <header className="flex flex-col items-center gap-4 text-center">
        {/* A long word may break only when nothing else fits (200% zoom on a 320 px phone). */}
        <h1 className="max-w-full wrap-anywhere">{title}</h1>
        <span aria-hidden="true" className="h-px w-16 bg-gold" />
        {intro && <PlainText text={intro} className="justify-items-center text-lg" />}
      </header>
      {body && <PlainText text={body} className="mx-auto w-full max-w-measure" />}
      <PagePhotoGrid photos={photos} />
      {children}
    </article>
  );
}

/** The page read failed (S-245 AC5): the shared content-page error state (Retry, WhatsApp; S-251). */
export { SitePageError } from "./page-error";

interface BrandPageMetaArgs {
  loaderData: { title: string; description: string; indexable: boolean; page: { photos: PagePhotoView[] } | null } | undefined;
  matches: readonly unknown[];
  location: { pathname: string };
}

/**
 * Head of a brand page through the shared S-253 helper: title, description, canonical, share
 * preview (the page's first photo, else the brand image) and noindex while it holds sample text
 * (FR-081; the sitemap reads the same `is_placeholder`). Routes using it export `handle = SEO_HANDLE`.
 */
export function brandPageMeta({ loaderData, matches, location }: BrandPageMetaArgs, path: string) {
  if (!loaderData) return [];
  return seoMeta({
    origin: rootOrigin(matches),
    locale: localeFromPathname(location.pathname),
    path,
    title: loaderData.title,
    description: loaderData.description,
    image: loaderData.page?.photos[0]?.url ?? null,
    noindex: !loaderData.indexable,
  });
}
