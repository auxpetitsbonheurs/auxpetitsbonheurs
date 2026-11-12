import { SiteNavLinks } from "~/components/site/site-nav";
import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import type { Route } from "./+types/menu-links";

/**
 * The phone menu without JavaScript (S-243 AC8): before hydration, or when scripts fail, the
 * menu button is a link here, a plain page with the same 7 links. noindex: not a destination.
 */
export function loader({ url }: Route.LoaderArgs) {
  return { title: t("nav.menuLinksTitle", localeFromPathname(url.pathname)) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex" }];
}

export default function MenuLinks() {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("nav.menuLinksTitle")}</h1>
      <nav aria-labelledby="menu-links-title" className="mt-6">
        <h2 id="menu-links-title" className="sr-only">
          {t("nav.menuTitle")}
        </h2>
        {/* On cream the current-page underline follows the link colour (light gold is for burgundy bands). */}
        <SiteNavLinks variant="panel" className="text-primary-strong [&_a]:decoration-current" />
      </nav>
    </>
  );
}
