import { Outlet } from "react-router";
import { namespaceMessages } from "~/i18n/catalog.server";
import { ExtraMessages } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { responseHeaders } from "~/server/response-headers.server";
import type { Route } from "./+types/layout";

/**
 * Customer account pages (E-11): private (never stored by a cache, never indexed) and with
 * their own text (`account` namespace), which browsing pages do not carry (NFR-001). Every
 * child loader and action runs `requireCustomer` itself where a session is needed.
 */
export const middleware: Route.MiddlewareFunction[] = [responseHeaders({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" })];

export function loader({ url }: Route.LoaderArgs) {
  return { messages: namespaceMessages(localeFromPathname(url.pathname), "account") };
}

/** The text only changes with the language, which is another layout route. */
export function shouldRevalidate() {
  return false;
}

export default function AccountLayout({ loaderData }: Route.ComponentProps) {
  return (
    <ExtraMessages messages={loaderData.messages}>
      <Outlet />
    </ExtraMessages>
  );
}
