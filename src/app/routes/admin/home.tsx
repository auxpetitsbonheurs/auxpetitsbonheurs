import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import { adminPageLocale } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import type { Route } from "./+types/home";

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.today" };

/** `/admin` until Today arrives (E-02/E-06): a greeting and the way to the review list. */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  return { name: me.name, title: translate("admin.home.metaTitle", adminPageLocale(args)) };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminHome({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  return (
    <>
      <h1>{t("admin.home.title", { name: loaderData.name })}</h1>
      <p className="mt-2 max-w-measure">{t("admin.home.body")}</p>
      <p className="mt-4">
        <a href="/admin/orders?tab=review" className="inline-flex min-h-11 items-center font-semibold link">
          {t("admin.home.ordersToReview")}
        </a>
      </p>
    </>
  );
}
