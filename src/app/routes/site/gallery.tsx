import { MessageCircle } from "lucide-react";
import { data, Link } from "react-router";
import { SitePageError, SitePageView, brandPageMeta, useSiteContacts } from "~/components/site/site-page-view";
import { Button } from "~/components/ui/button";
import { t as serverT } from "~/i18n/catalog.server";
import { SEO_HANDLE } from "~/lib/seo";
import { useI18n } from "~/i18n/react";
import { whatsappHref } from "~/lib/contact";
import { localeFromPathname, localePath } from "~/lib/locale";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { GALLERY_TILE_SIZES } from "~/lib/photo-sizes";
import { timed } from "~/server/server-timing.server";
import { getGalleryPage } from "~/server/services/site-page.server";
import type { Route } from "./+types/gallery";

/** Photos on the first view (S-250 AC3); "Show more" loads the rest. */
const GALLERY_PAGE_SIZE = 24;
/** First row at every width: eager; the rest lazy. */
const EAGER_PHOTOS = 2;

/**
 * `site/gallery` (`/gallery`, `/fr/gallery`; E-13 S-250, FR-078, FR-009): the editable intro
 * (Pages) and the gallery photos (S-054/S-055 table) in the admin's order, 24 at first and
 * all with `?more=1` (a real link: works without JavaScript, keeps the scroll position).
 * No lightbox yet (E-04 S-069). Ships with its "coming soon" empty state.
 */
export async function loader({ context, url }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const db = context.get(requestDbContext).db;
  const { supabaseUrl } = context.get(publicConfigContext);
  // One statement for the page text and the photos on a cold isolate (S-254).
  const { read, gallery } = await timed(context, "page", () => getGalleryPage(db, locale, supabaseUrl, serverT("sitePages.gallery.photoAlt", locale)));
  const seo = { title: serverT("sitePages.gallery.title", locale), description: serverT("sitePages.gallery.metaDescription", locale) };
  if (!read.ok || !gallery.ok) return data({ ...seo, page: null, photos: [], total: 0, indexable: false }, { status: 503 });
  const all = url.searchParams.get("more") === "1";
  const photos = all ? gallery.photos : gallery.photos.slice(0, GALLERY_PAGE_SIZE);
  return { ...seo, page: read.page, photos, total: gallery.photos.length, indexable: !read.page.isPlaceholder };
}

/** Its meta uses seoMeta (S-253): the site layout leaves the share image to it. */
export const handle = SEO_HANDLE;

export function meta(args: Route.MetaArgs) {
  return brandPageMeta(args, "/gallery");
}

type Photo = Route.ComponentProps["loaderData"]["photos"][number];

function EmptyGallery() {
  const { t, locale } = useI18n();
  const contacts = useSiteContacts();
  return (
    <section aria-labelledby="gallery-empty" className="rounded-card border border-border bg-card p-2 text-center min-[20rem]:p-4 sm:p-6">
      <h2 id="gallery-empty" className="text-2xl">
        {t("sitePages.gallery.empty")}
      </h2>
      <p className="mx-auto mt-2 max-w-measure">{t("sitePages.gallery.emptyBody")}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <Button asChild className="h-auto max-w-full shrink whitespace-normal wrap-anywhere">
          <Link to={localePath(locale, "/menu")}>{t("sitePages.gallery.collectionLink")}</Link>
        </Button>
        {contacts?.whatsapp && (
          <Button asChild variant="secondary" className="h-auto max-w-full shrink whitespace-normal wrap-anywhere">
            <a href={whatsappHref(contacts.whatsapp)}>
              <MessageCircle aria-hidden="true" strokeWidth={1.75} />
              {t("sitePages.gallery.whatsapp")}
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}

/** "Request something similar" (E-08 S-154 AC5): the request form with this photo attached; its name says which photo. */
function SimilarLink({ id, alt }: { id: string; alt: string }) {
  const { t, locale } = useI18n();
  return (
    <Link to={localePath(locale, `/custom-cake?fromGallery=${id}`)} aria-label={t("customRequest.similarLabel", { photo: alt })} className="mt-1 inline-flex min-h-11 items-center font-semibold link wrap-anywhere">
      {t("customRequest.similar")}
    </Link>
  );
}

function GalleryGrid({ photos, total }: { photos: Photo[]; total: number }) {
  const { t } = useI18n();
  return (
    <section aria-label={t("sitePages.gallery.listLabel")} className="grid gap-6">
      <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {photos.map((photo, index) => (
          <li key={photo.url} className="min-w-0">
            <figure className="grid gap-2">
              <img
                src={photo.url}
                srcSet={photo.srcSet}
                sizes={photo.srcSet && GALLERY_TILE_SIZES}
                alt={photo.alt}
                width={photo.width}
                height={photo.height}
                loading={index < EAGER_PHOTOS ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
                decoding="async"
                className="aspect-square h-auto w-full rounded-card bg-decorative object-cover"
              />
              {photo.caption && <figcaption className="text-sm wrap-anywhere">{photo.caption}</figcaption>}
            </figure>
            {photo.id && <SimilarLink id={photo.id} alt={photo.alt} />}
          </li>
        ))}
      </ul>
      {total > photos.length && (
        <p className="text-center">
          <Button asChild variant="outline" className="h-auto min-h-11 max-w-full shrink whitespace-normal wrap-anywhere">
            <Link to="?more=1" preventScrollReset replace>
              {t("sitePages.gallery.showMore")}
            </Link>
          </Button>
        </p>
      )}
    </section>
  );
}

export default function Gallery({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { page, photos, total } = loaderData;
  if (!page) return <SitePageError title={t("sitePages.gallery.title")} />;
  return (
    <SitePageView title={t("sitePages.gallery.title")} intro={page.text.intro}>
      {photos.length === 0 ? <EmptyGallery /> : <GalleryGrid photos={photos} total={total} />}
    </SitePageView>
  );
}
