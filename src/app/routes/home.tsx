import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import type { Route } from "./+types/home";

export function loader({ request }: Route.LoaderArgs) {
  const locale = localeFromPathname(new URL(request.url).pathname);
  return { title: t("home.title", locale), description: t("home.metaDescription", locale) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.title ?? ""} | Aux petits bonheurs` },
    { name: "description", content: loaderData?.description },
  ];
}

export default function Home() {
  const { t } = useI18n();
  return (
    // Centred hero (brand D4): Caslon display headline, muted intro. Below 20rem
    // (200% zoom on a 320 px phone) the headline keeps the smaller h1 size.
    <section className="mx-auto flex max-w-2xl flex-col gap-4 pt-4 text-center">
      <h1 className="min-[20rem]:text-display md:text-display-lg">{t("home.title")}</h1>
      <p className="mx-auto max-w-measure text-lg text-muted-foreground">{t("home.intro")}</p>
    </section>
  );
}
