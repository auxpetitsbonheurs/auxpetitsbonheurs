import { useEffect } from "react";
import { Outlet, redirect, useLocation, useMatches, useRouteLoaderData } from "react-router";
import { LanguageSwitch } from "~/components/shell/language-switch";
import { NavProgress } from "~/components/shell/nav-progress";
import { PromoBanner } from "~/components/shell/promo-banner";
import { SiteFooter } from "~/components/shell/site-footer";
import { SiteHeader } from "~/components/shell/site-header";
import { SkipLink } from "~/components/shell/skip-link";
import { todayMU } from "~/domain/time";
import { readCookie } from "~/lib/cookies";
import { basketStore } from "~/lib/basket-store";
import { localeFromPathname } from "~/lib/locale";
import { menuStore } from "~/lib/menu-cache";
import { BRAND_SHARE_IMAGE, handlesOwnShareImage } from "~/lib/seo";
import { LOCALE_COOKIE, decideLocale, localeCookie, twinPath } from "~/lib/locale-detect";
import { readBasketCount } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { photoOrigin } from "~/lib/images";
import { whenLoadedAndIdle } from "~/lib/after-load";
import { dismissedBanners, siteBanner } from "~/server/banner.server";
import { getSitePromotions } from "~/server/repos/promotions.server";
import { getSiteSettings } from "~/server/repos/settings.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/layout";

/**
 * Locale rules for every customer page (S-008): first-visit and returning-visitor
 * redirects to the /fr twin, and the page language remembered in `apb_locale`.
 */
export const middleware: Route.MiddlewareFunction[] = [
  async ({ request }, next) => {
    const url = new URL(request.url);
    const decision = decideLocale({
      pathname: url.pathname,
      search: url.search,
      cookie: readCookie(request, LOCALE_COOKIE),
      acceptLanguage: request.headers.get("accept-language"),
      secFetchSite: request.headers.get("sec-fetch-site"),
    });
    if (decision.redirectTo) throw redirect(decision.redirectTo, 302);
    const response = await next();
    if (decision.rememberLocale) response.headers.append("Set-Cookie", localeCookie(decision.rememberLocale));
    return response;
  },
];

/** The header band's colour (tokens.json color.band, the same in light and dark). */
const SITE_BAND = "#660C0C";

/** Customer page frame (S-007): skip link, header, one main landmark, footer. */
export async function loader({ request, context }: Route.LoaderArgs) {
  // Cached per isolate: most page loads make no database round trip for the frame.
  const db = context.get(requestDbContext).db;
  const clock = context.get(clockContext);
  const [{ footer: contacts }, promotions] = await Promise.all([
    timed(context, "settings", () => getSiteSettings(db)),
    // A failed read must not take every page down: the frame shows no banner instead.
    timed(context, "promotions", () => getSitePromotions(db, clock)).catch((error: unknown) => {
      console.error(JSON.stringify({ level: "error", event: "banner_read_failed", message: error instanceof Error ? error.message : String(error) }));
      return [];
    }),
  ]);
  const now = clock.now();
  return {
    basketCount: readBasketCount(request),
    photoOrigin: photoOrigin(context.get(publicConfigContext).supabaseUrl),
    contacts,
    year: todayMU(now).slice(0, 4),
    // S-062: the live banner promotion at this request's instant, unless dismissed in this session.
    banner: siteBanner(promotions, now, dismissedBanners(request)),
  };
}

/**
 * ADR-0004: nothing in the frame needs the server again within one language (the basket
 * count comes from the browser basket, the switch link from the URL, the footer changes
 * rarely), so a client navigation or an Add makes no request for it. The other language is
 * another layout route and loads its own.
 */
export function shouldRevalidate() {
  return false;
}

/**
 * Once per page load: warm the menu cache in the background (so the basket opens without a
 * round trip), and convert a basket cookie written before ADR-0004 (HttpOnly, unreadable by
 * the page) by asking the server to re-set it.
 */
function useBrowserBasket(serverCount: number) {
  useEffect(() => {
    if (serverCount > 0 && basketStore.lines().length === 0) {
      void fetch("/api/basket/reissue", { method: "POST" })
        .then(() => basketStore.refresh())
        .catch(() => undefined);
    }
    // After load (S-276 AC7): the menu request no longer shares the bandwidth of the LCP photo.
    return whenLoadedAndIdle(() => void menuStore.revalidate());
  }, [serverCount]);
}

/**
 * The brand share image (S-253 AC3) for customer pages whose meta does not bring its own: pages
 * using seoMeta (lib/seo) export `handle = SEO_HANDLE`, so there is never a second og:image.
 * Hoisted into <head> by React; here rather than in root so the admin app never loads lib/seo.
 */
function BrandShareImage() {
  const root = useRouteLoaderData("root") as { origin?: string | null } | undefined;
  const ownShareImage = useMatches().some((match) => handlesOwnShareImage(match.handle));
  if (!root?.origin || ownShareImage) return null;
  return (
    <>
      <meta property="og:image" content={`${root.origin}${BRAND_SHARE_IMAGE.path}`} />
      <meta property="og:image:width" content={String(BRAND_SHARE_IMAGE.width)} />
      <meta property="og:image:height" content={String(BRAND_SHARE_IMAGE.height)} />
    </>
  );
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const other = localeFromPathname(location.pathname) === "fr" ? "en" : "fr";
  useBrowserBasket(loaderData.basketCount);
  return (
    <div className="flex min-h-dvh flex-col">
      {/* React hoists this into <head>: the phone's browser bar matches the burgundy header band (tokens color.band). */}
      <meta name="theme-color" content={SITE_BAND} />
      {/* Hoisted to the top of <head> by React: the photo host's connection opens while the page parses (S-276 AC7). */}
      {loaderData.photoOrigin && <link rel="preconnect" href={loaderData.photoOrigin} />}
      <BrandShareImage />
      <NavProgress />
      <SkipLink />
      <PromoBanner banner={loaderData.banner} />
      <SiteHeader
        basketCount={loaderData.basketCount}
        languageSwitch={<LanguageSwitch href={twinPath(location.pathname, location.search, other)} />}
      />
      {/* tabIndex lets the skip link move focus here in every browser; not a control, so no ring. */}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none md:px-6">
        <Outlet />
      </main>
      <SiteFooter contacts={loaderData.contacts} year={loaderData.year} />
    </div>
  );
}
