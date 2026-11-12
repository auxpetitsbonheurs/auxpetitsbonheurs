import { useEffect } from "react";
import { Outlet, redirect, useLocation } from "react-router";
import { LanguageSwitch } from "~/components/shell/language-switch";
import { NavProgress } from "~/components/shell/nav-progress";
import { SiteFooter } from "~/components/shell/site-footer";
import { SiteHeader } from "~/components/shell/site-header";
import { SkipLink } from "~/components/shell/skip-link";
import { todayMU } from "~/domain/time";
import { readCookie } from "~/lib/cookies";
import { basketStore } from "~/lib/basket-store";
import { localeFromPathname } from "~/lib/locale";
import { menuStore } from "~/lib/menu-cache";
import { LOCALE_COOKIE, decideLocale, localeCookie, twinPath } from "~/lib/locale-detect";
import { readBasketCount } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
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
  const { footer: contacts } = await timed(context, "settings", () => getSiteSettings(context.get(requestDbContext).db));
  return {
    basketCount: readBasketCount(request),
    contacts,
    year: todayMU(context.get(clockContext).now()).slice(0, 4),
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
    const warm = () => void menuStore.revalidate();
    if ("requestIdleCallback" in window) window.requestIdleCallback(warm, { timeout: 2000 });
    else setTimeout(warm, 1000);
  }, [serverCount]);
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  const location = useLocation();
  const other = localeFromPathname(location.pathname) === "fr" ? "en" : "fr";
  useBrowserBasket(loaderData.basketCount);
  return (
    <div className="flex min-h-dvh flex-col">
      {/* React hoists this into <head>: the phone's browser bar matches the burgundy header band (tokens color.band). */}
      <meta name="theme-color" content={SITE_BAND} />
      <NavProgress />
      <SkipLink />
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
