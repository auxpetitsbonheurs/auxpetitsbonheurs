import { data, Link } from "react-router";
import { SitePageError, SitePageView, brandPageMeta } from "~/components/site/site-page-view";
import { t as serverT } from "~/i18n/catalog.server";
import { SEO_HANDLE } from "~/lib/seo";
import { useI18n } from "~/i18n/react";
import { localeFromPathname, localePath } from "~/lib/locale";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { timed } from "~/server/server-timing.server";
import { getSitePage } from "~/server/services/site-page.server";
import type { Route } from "./+types/our-story";

/**
 * `site/our-story` (`/our-story`, `/fr/our-story`; E-13 S-248, FR-078): the bakery's story
 * from the admin Pages content (S-245 read, cached per isolate). Sample text is noindex. A
 * failed read answers 503 with the page error state (Retry, WhatsApp), never a white screen.
 */
export async function loader({ context, url }: Route.LoaderArgs) {
  const locale = localeFromPathname(url.pathname);
  const read = await timed(context, "page", () => getSitePage(context.get(requestDbContext).db, "our_story", locale, context.get(publicConfigContext).supabaseUrl));
  const seo = { title: serverT("sitePages.ourStory.title", locale), description: serverT("sitePages.ourStory.metaDescription", locale) };
  if (!read.ok) return data({ ...seo, page: null, indexable: false }, { status: 503 });
  return { ...seo, page: read.page, indexable: !read.page.isPlaceholder };
}

/** Its meta uses seoMeta (S-253): the site layout leaves the share image to it. */
export const handle = SEO_HANDLE;

export function meta(args: Route.MetaArgs) {
  return brandPageMeta(args, "/our-story");
}

export default function OurStory({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { page } = loaderData;
  if (!page) return <SitePageError title={t("sitePages.ourStory.title")} />;
  return (
    <SitePageView title={t("sitePages.ourStory.title")} intro={page.text.intro} body={page.text.body} photos={page.photos}>
      {/* One clear next step (S-248 AC6). */}
      <p className="text-center">
        <Link to={localePath(locale, "/menu")} className="inline-flex min-h-11 items-center font-semibold link">
          {t("sitePages.ourStory.collectionLink")}
        </Link>
      </p>
    </SitePageView>
  );
}
