import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  type ShouldRevalidateFunctionArgs,
  useLocation,
  useRouteLoaderData,
} from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider, useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { twinPath } from "~/lib/locale-detect";
import { adminLocaleContext } from "~/server/admin-page.server";

export function loader({ url, context }: Route.LoaderArgs) {
  // `url` is normalised (no `.data` suffix on client data requests).
  // Admin pages have no URL language: they follow the admin's (set by the admin middleware).
  const adminLocale = context.get(adminLocaleContext);
  const locale = adminLocale ?? localeFromPathname(url.pathname);
  // hreflang alternates (S-008 AC5) are built from the current URL in Layout; none for admin pages.
  // Only the active locale's messages reach the browser (S-006 AC5).
  return { locale, origin: adminLocale ? null : url.origin, messages: messagesFor(locale) };
}

const isAdminPath = (pathname: string) => pathname === "/admin" || pathname.startsWith("/admin/");

/**
 * ADR-0004: customer navigations within one language need nothing new from the root (locale
 * and messages are per language; hreflang follows the URL), so they make no request for it.
 * Admin pages likewise: the admin's language only changes through an action (sign-in,
 * sign-out, profile), so a plain navigation between admin pages keeps the root data. That
 * also keeps the frame's text when a page's data fails to load (S-041 AC3).
 */
export function shouldRevalidate({ currentUrl, nextUrl, formMethod, defaultShouldRevalidate }: ShouldRevalidateFunctionArgs) {
  const [fromAdmin, toAdmin] = [isAdminPath(currentUrl.pathname), isAdminPath(nextUrl.pathname)];
  if (fromAdmin && toAdmin && !formMethod) return false;
  if (fromAdmin || toAdmin) return defaultShouldRevalidate;
  if (localeFromPathname(currentUrl.pathname) !== localeFromPathname(nextUrl.pathname)) return defaultShouldRevalidate;
  return false;
}

/** The EN and FR twins of the current page, without the query. */
function useAlternates(origin: string | null | undefined) {
  const { pathname } = useLocation();
  return origin ? { en: `${origin}${twinPath(pathname, "", "en")}`, fr: `${origin}${twinPath(pathname, "", "fr")}` } : null;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const locale = data?.locale ?? "en";
  const alternates = useAlternates(data?.origin);
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {alternates && (
          <>
            <link rel="alternate" hrefLang="en" href={alternates.en} />
            <link rel="alternate" hrefLang="fr" href={alternates.fr} />
            <link rel="alternate" hrefLang="x-default" href={alternates.en} />
          </>
        )}
      </head>
      <body>
        <I18nProvider locale={locale} messages={data?.messages ?? {}}>
          {children}
        </I18nProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  useEffect(() => {
    // Hydration marker: e2e specs wait for it before testing client-side behaviour.
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  const stack = import.meta.env.DEV && error instanceof Error ? error.stack : undefined;

  return (
    <main className="p-4">
      <h1>{t(notFound ? "errors.notFoundTitle" : "errors.genericTitle")}</h1>
      <p>{t(notFound ? "errors.notFoundBody" : "errors.genericBody")}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
