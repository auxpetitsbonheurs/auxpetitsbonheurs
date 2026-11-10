import { Outlet, redirect } from "react-router";
import { LanguageSwitch } from "~/components/shell/language-switch";
import { SiteFooter } from "~/components/shell/site-footer";
import { SiteHeader } from "~/components/shell/site-header";
import { SkipLink } from "~/components/shell/skip-link";
import { todayMU } from "~/domain/time";
import { readCookie } from "~/lib/cookies";
import { localeFromPathname } from "~/lib/locale";
import { LOCALE_COOKIE, decideLocale, localeCookie, twinPath } from "~/lib/locale-detect";
import { readBasketCount } from "~/server/basket.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { getFooterContacts } from "~/server/repos/settings.server";
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

/** Customer page frame (S-007): skip link, header, one main landmark, footer. */
export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const other = localeFromPathname(url.pathname) === "fr" ? "en" : "fr";
  const contacts = await getFooterContacts(context.get(requestDbContext).db);
  return {
    switchHref: twinPath(url.pathname, url.search, other),
    basketCount: readBasketCount(request),
    contacts,
    year: todayMU(context.get(clockContext).now()).slice(0, 4),
  };
}

export default function SiteLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <SiteHeader
        basketCount={loaderData.basketCount}
        languageSwitch={<LanguageSwitch href={loaderData.switchHref} />}
      />
      {/* tabIndex lets the skip link move focus here in every browser; not a control, so no ring. */}
      <main id="main" tabIndex={-1} className="mx-auto w-full max-w-content flex-1 px-4 py-8 outline-none md:px-6">
        <Outlet />
      </main>
      <SiteFooter contacts={loaderData.contacts} year={loaderData.year} />
    </div>
  );
}
