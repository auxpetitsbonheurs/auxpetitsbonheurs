import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { SEO_HANDLE, rootOrigin, seoMeta } from "~/lib/seo";
import type { Route } from "./+types/home";

/** Its meta uses seoMeta: the site layout leaves the brand share image to it. */
export const handle = SEO_HANDLE;

export function loader({ request }: Route.LoaderArgs) {
  const locale = localeFromPathname(new URL(request.url).pathname);
  return { title: t("home.title", locale), description: t("home.metaDescription", locale) };
}

export function meta({ loaderData, matches, location }: Route.MetaArgs) {
  if (!loaderData) return [];
  return seoMeta({ origin: rootOrigin(matches), locale: localeFromPathname(location.pathname), path: "/", ...loaderData });
}

export default function Home() {
  const { t } = useI18n();
  return (
    // Centred hero (brand v0.3): Cormorant display headline, a short gold rule, muted
    // intro. Below 20rem (200% zoom on a 320 px phone) the headline keeps the smaller h1 size.
    <section className="mx-auto flex max-w-2xl flex-col gap-4 pt-4 text-center">
      <h1 className="min-[20rem]:text-display md:text-display-lg">{t("home.title")}</h1>
      <span aria-hidden="true" className="mx-auto h-px w-16 bg-gold" />
      <p className="mx-auto max-w-measure text-lg text-muted-foreground">{t("home.intro")}</p>
    </section>
  );
}
