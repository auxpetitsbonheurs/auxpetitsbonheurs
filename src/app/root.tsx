import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";
import { useEffect } from "react";

import type { Route } from "./+types/root";
import "./app.css";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider, useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { twinPath } from "~/lib/locale-detect";

export function loader({ url }: Route.LoaderArgs) {
  // `url` is normalised (no `.data` suffix on client data requests).
  const locale = localeFromPathname(url.pathname);
  // hreflang alternates: the EN and FR twins of this page, without the query (S-008 AC5).
  const alternates = {
    en: `${url.origin}${twinPath(url.pathname, "", "en")}`,
    fr: `${url.origin}${twinPath(url.pathname, "", "fr")}`,
  };
  // Only the active locale's messages reach the browser (S-006 AC5).
  return { locale, alternates, messages: messagesFor(locale) };
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData<typeof loader>("root");
  const locale = data?.locale ?? "en";
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links />
        {data && (
          <>
            <link rel="alternate" hrefLang="en" href={data.alternates.en} />
            <link rel="alternate" hrefLang="fr" href={data.alternates.fr} />
            <link rel="alternate" hrefLang="x-default" href={data.alternates.en} />
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
