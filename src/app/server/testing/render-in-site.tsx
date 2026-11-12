// Test helper: server-renders a customer component at `path` with the real i18n catalogue.
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { messagesFor } from "~/i18n/catalog.server";
import { I18nProvider } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";

export function renderInSite(element: ReactElement, path = "/"): string {
  const locale = localeFromPathname(path);
  const Stub = createRoutesStub([{ path: "*", Component: () => element }]);
  return renderToStaticMarkup(
    <I18nProvider locale={locale} messages={messagesFor(locale)}>
      <Stub initialEntries={[path]} />
    </I18nProvider>,
  );
}

/** The `<a>` tags of `html` as { href, text, current } in document order. */
export function links(html: string): { href: string; text: string; current: boolean; attrs: string }[] {
  return [...html.matchAll(/<a ([^>]*)>(.*?)<\/a>/g)].map(([, attrs = "", inner = ""]) => ({
    href: /href="([^"]*)"/.exec(attrs)?.[1] ?? "",
    text: inner.replace(/<[^>]+>/g, "").trim(),
    current: attrs.includes('aria-current="page"'),
    attrs,
  }));
}
