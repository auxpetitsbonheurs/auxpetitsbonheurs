import { data } from "react-router";
import {
  HomeCollection,
  HomeCustomBand,
  HomeGalleryPreview,
  HomeHero,
  HomeHowItWorks,
  HomeOffers,
  HomeProductRow,
  HomePromises,
} from "~/components/site/home-sections";
import { SitePageError } from "~/components/site/page-error";
import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { timed } from "~/server/server-timing.server";
import { loadHome } from "~/server/services/home.server";
import type { Route } from "./+types/home";

/** Its meta uses seoMeta: the site layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

/**
 * `site/home` (FR-004, S-063; contracts.md): hero, category cards, promotion cards, seasonal and
 * featured rows, gallery preview. A failed read answers 503 with the error state (AC7): the
 * frame (header, footer with WhatsApp) still renders.
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const locale = localeFromPathname(new URL(request.url).pathname);
  const seo = { title: t("home.title", locale), description: t("home.metaDescription", locale) };
  try {
    const home = await timed(context, "home", () =>
      loadHome({
        db: context.get(requestDbContext).db,
        supabaseUrl: context.get(publicConfigContext).supabaseUrl,
        now: context.get(clockContext).now(),
        locale,
        galleryAlt: t("sitePages.gallery.photoAlt", locale),
      }),
    );
    return { ...seo, home };
  } catch (error) {
    console.log(JSON.stringify({ level: "warn", event: "home_read_failed", error: error instanceof Error ? error.message.slice(0, 200) : "unknown" }));
    throw data(null, { status: 503 });
  }
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  const { title, description, home } = loaderData;
  return seoMeta({ origin: rootOrigin(matches), locale: localeFromPathname(location.pathname), path: "/", title, description, image: home.hero.photo?.url ?? null });
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { home } = loaderData;
  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <div>
        <HomeHero hero={home.hero} />
        <HomePromises />
      </div>
      <HomeOffers cards={home.promoCards} />
      <HomeCollection categories={home.categories} />
      <HomeProductRow id="home-seasonal" title={t("home.seasonal")} products={home.seasonal} />
      <HomeProductRow id="home-featured" title={t("home.featured")} products={home.featured} />
      <HomeHowItWorks />
      <HomeCustomBand />
      <HomeGalleryPreview photos={home.gallery} />
    </div>
  );
}

/** The home read failed (AC7): a calm error with Retry and WhatsApp instead of a blank page. */
export function ErrorBoundary() {
  const { t } = useI18n();
  return <SitePageError title={t("home.errorTitle")} />;
}
