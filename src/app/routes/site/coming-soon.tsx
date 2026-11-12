import { data } from "react-router";
import { Link } from "react-router";
import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname, localePath } from "~/lib/locale";
import { PLACEHOLDER_PAGES, type PlaceholderPage, currentNavKey } from "~/lib/site-nav";
import type { Route } from "./+types/coming-soon";

/**
 * Placeholder for a nav page a later story builds (E-13 S-248 to S-252): Our story, Custom
 * order, Workshops, Gallery, Contact us. A calm "coming soon" page (200, noindex) so no nav
 * link is ever a 404 (S-242 Notes). Each later story replaces its route's module.
 */
export function loader({ url }: Route.LoaderArgs) {
  const key = currentNavKey(url.pathname);
  if (!key || !(PLACEHOLDER_PAGES as readonly string[]).includes(key)) throw data(null, { status: 404 });
  const locale = localeFromPathname(url.pathname);
  return { page: key as PlaceholderPage, title: t(`nav.items.${key}`, locale) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex" }];
}

export default function ComingSoon({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  return (
    <section className="mx-auto flex max-w-2xl flex-col items-center gap-4 pt-4 text-center">
      <h1>{t(`nav.items.${loaderData.page}`)}</h1>
      <span aria-hidden="true" className="h-px w-16 bg-gold" />
      <p className="max-w-measure text-lg">{t("comingSoon.body")}</p>
      <p className="max-w-measure text-muted-foreground">{t("comingSoon.hint")}</p>
      <Link to={localePath(locale, "/menu")} className="inline-flex min-h-11 items-center font-semibold link">
        {t("comingSoon.collectionLink")}
      </Link>
    </section>
  );
}
