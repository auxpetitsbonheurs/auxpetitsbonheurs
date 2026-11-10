import { todayMU } from "~/domain/time";
import { t } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { localeFromPathname } from "~/lib/locale";
import { clockContext } from "~/server/clock.server";
import type { Route } from "./+types/home";

export function loader({ context, request }: Route.LoaderArgs) {
  const locale = localeFromPathname(new URL(request.url).pathname);
  return {
    year: todayMU(context.get(clockContext).now()).slice(0, 4),
    title: t("home.title", locale),
    description: t("home.metaDescription", locale),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [
    { title: `${loaderData?.title ?? ""} | Aux petits bonheurs` },
    { name: "description", content: loaderData?.description },
  ];
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <main className="p-4">
        <h1>{t("home.title")}</h1>
        <p>{t("home.intro")}</p>
      </main>
      <footer className="p-4">
        <p>{t("shell.footer.copyright", { year: loaderData.year })}</p>
      </footer>
    </>
  );
}
