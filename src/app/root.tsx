import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider, useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";

export function loader({ request }: Route.LoaderArgs) {
  const locale = localeFromPathname(new URL(request.url).pathname);
  // Only the active locale's messages reach the browser (S-006 AC5).
  return { locale, messages: messagesFor(locale) };
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
