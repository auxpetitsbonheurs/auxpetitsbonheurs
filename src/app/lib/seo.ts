// Page head for customer pages (S-253, FR-081, NFR-010; shared with S-071): title, description,
// canonical, robots and share-preview tags from one call, so every page says the same things the
// same way. Pure: no React, no server. hreflang alternates come from the root Layout (S-008 AC5),
// which builds them from the URL for every customer page. The share image is the page's photo,
// else the brand image; a route using seoMeta exports `handle = SEO_HANDLE` so the site layout
// leaves out its own brand `og:image` (one share image per page, never two).
//
// Placeholder pages (S-245 `is_placeholder`): pass `noindex: isPlaceholder`. The same flag keeps
// the page out of /sitemap.xml (server/seo-pages.server.ts).
import type { MetaDescriptor } from "react-router";
import { type Locale, localePath } from "~/lib/locale";

export const SITE_NAME = "Aux petits bonheurs";

/** Search engines cut descriptions outside this range; the catalogue test holds every page to it. */
export const DESCRIPTION_LENGTH = { min: 50, max: 160 } as const;

/** `export const handle = SEO_HANDLE` on a route whose `meta` uses seoMeta (read by the customer layout). */
export const SEO_HANDLE = { seo: true } as const;

/** The brand share image (brand v0.3 cream logo badge on burgundy), 1200 x 630. */
export const BRAND_SHARE_IMAGE = { path: "/brand/og-image.png", width: 1200, height: 630 } as const;

/** True when a route handle says its meta brings its own share image. */
export function handlesOwnShareImage(handle: unknown): boolean {
  return (handle as { seo?: unknown } | undefined)?.seo === true;
}

const OG_LOCALE: Record<Locale, string> = { en: "en_MU", fr: "fr_MU" };

export interface PageSeo {
  /** The site's origin (root loader); null on admin pages, where no URL tags are emitted. */
  origin: string | null | undefined;
  locale: Locale;
  /** The page path without the language prefix ("/contact"); never a query string. */
  path: string;
  /** The page's own title, without the site name. */
  title: string;
  description: string;
  /** The page's first photo (absolute or root-relative); the brand image otherwise. */
  image?: string | null;
  /** True while the page still holds placeholder text, and for private pages. */
  noindex?: boolean;
  /** Text alternative of the page's own share image (S-224), e.g. the product name. */
  imageAlt?: string;
}

/** Widest share image sent to previews: WhatsApp and Facebook show 1200 px wide at most. */
export const SHARE_IMAGE_MAX_WIDTH = 1200;

/**
 * A page description search engines and previews show whole (S-224): the text itself, on one
 * line, cut on a word with "…" past 160 characters; the fallback when the text is missing or
 * shorter than 50 characters.
 */
export function metaDescription(text: string | null | undefined, fallback: string): string {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const chosen = text && clean(text).length >= DESCRIPTION_LENGTH.min ? clean(text) : clean(fallback);
  if (chosen.length <= DESCRIPTION_LENGTH.max) return chosen;
  const cut = chosen.slice(0, DESCRIPTION_LENGTH.max - 1);
  const word = cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length);
  return `${word.replace(/[\s,.;:!?-]+$/, "")}…`;
}

/**
 * The share image of a photo (S-224 AC1, AC6): its widest stored copy no wider than 1200 px
 * (srcset), else the original; null for an SVG, which link previews cannot show.
 */
export function shareImage(photo: { url: string; srcSet?: string } | null | undefined): string | null {
  if (!photo || /\.svg(?:$|[?#])/i.test(photo.url)) return null;
  const copies = (photo.srcSet ?? "")
    .split(",")
    .map((entry) => entry.trim().match(/^(\S+)\s+(\d+)w$/))
    .flatMap((m) => (m ? [{ url: m[1]!, width: Number(m[2]) }] : []))
    .filter((copy) => copy.width <= SHARE_IMAGE_MAX_WIDTH)
    .sort((a, b) => b.width - a.width);
  return copies[0]?.url ?? photo.url;
}

export function pageTitle(title: string): string {
  return title && title !== SITE_NAME ? `${title} | ${SITE_NAME}` : SITE_NAME;
}

/** The absolute canonical URL of `path` in `locale`: no query, no fragment. */
export function canonicalUrl(origin: string, locale: Locale, path: string): string {
  const clean = path.split(/[?#]/)[0] || "/";
  return `${origin}${localePath(locale, clean)}`;
}

function absolute(origin: string | null | undefined, src: string): string | null {
  if (/^https?:\/\//.test(src)) return src;
  return origin && src.startsWith("/") ? `${origin}${src}` : null;
}

/** The meta descriptors for a customer page (title, description, canonical, robots, Open Graph, Twitter). */
export function seoMeta(page: PageSeo): MetaDescriptor[] {
  const title = pageTitle(page.title);
  const tags: MetaDescriptor[] = [
    { title },
    { name: "description", content: page.description },
    { property: "og:type", content: "website" },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:locale", content: OG_LOCALE[page.locale] },
    { property: "og:title", content: title },
    { property: "og:description", content: page.description },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: page.description },
  ];
  if (page.noindex) tags.push({ name: "robots", content: "noindex" });
  if (page.origin) {
    const url = canonicalUrl(page.origin, page.locale, page.path);
    tags.push({ tagName: "link", rel: "canonical", href: url }, { property: "og:url", content: url });
  }
  const own = page.image ? absolute(page.origin, page.image) : null;
  const image = own ?? absolute(page.origin, BRAND_SHARE_IMAGE.path);
  if (image) tags.push({ property: "og:image", content: image }, { name: "twitter:image", content: image });
  if (own && page.imageAlt) tags.push({ property: "og:image:alt", content: page.imageAlt }, { name: "twitter:image:alt", content: page.imageAlt });
  if (image && !own) {
    tags.push(
      { property: "og:image:width", content: String(BRAND_SHARE_IMAGE.width) },
      { property: "og:image:height", content: String(BRAND_SHARE_IMAGE.height) },
    );
  }
  return tags;
}

/** The site origin from the root loader, for `meta` functions (`matches` from Route.MetaArgs). */
export function rootOrigin(matches: readonly unknown[]): string | null {
  for (const match of matches) {
    const m = match as { id?: string; loaderData?: { origin?: string | null } } | undefined;
    if (m?.id === "root") return m.loaderData?.origin ?? null;
  }
  return null;
}
