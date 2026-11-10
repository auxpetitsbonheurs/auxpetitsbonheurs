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
    <>
      <h1>{t("home.title")}</h1>
      <p className="mt-4 max-w-measure text-lg">{t("home.intro")}</p>
    </>
  );
}
