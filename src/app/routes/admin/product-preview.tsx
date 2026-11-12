import { ChevronLeft } from "lucide-react";
import { Link, data } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { SkipLink } from "~/components/shell/skip-link";
import { ProductArticle, productView } from "~/components/site/product-article";
import { seasonalTag } from "~/domain/product";
import { todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { adminMiddleware } from "~/server/admin-page.server";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { Uuid } from "~/server/contracts/shared";
import { requestDbContext } from "~/server/db.server";
import { customerProduct } from "~/server/product-view.server";
import { publicConfigContext } from "~/server/public-config.server";
import { findProductPreview } from "~/server/repos/catalogue.server";
import type { Route } from "./+types/product-preview";

/**
 * `admin/product-preview` (`/admin/menu/:id/preview`, S-051, FR-062): the customer product
 * page for any status (hidden, sold out, out of season), with a "Preview, not live" banner
 * and no Add to basket. Admins only; `private, no-store` and noindex on every response
 * (admin middleware). Outside the admin frame so it looks like the live page.
 */
export const middleware: Route.MiddlewareFunction[] = adminMiddleware;

const previewLang = (value: string | null): Locale => (value === "fr" ? "fr" : "en");

export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const id = Uuid.safeParse(args.params.id);
  if (!id.success) throw data(null, { status: 404 });
  const found = await findProductPreview(args.context.get(requestDbContext).db, id.data);
  if (!found) throw data(null, { status: 404 });
  const today = todayMU(args.context.get(clockContext).now());
  return {
    title: translate("admin.preview.title", me.locale),
    lang: previewLang(args.url.searchParams.get("lang")),
    product: customerProduct(found.record, args.context.get(publicConfigContext).supabaseUrl),
    status: found.record.status,
    season: seasonalTag({ type: found.record.type, ...found.season }, today),
    editUrl: `/admin/menu/${found.record.id}`,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export const ErrorBoundary = AdminErrorBoundary;

type LoaderData = Route.ComponentProps["loaderData"];

/** Why customers cannot order it right now, or null when they can. */
function statusNote(loaderData: LoaderData): string | null {
  if (loaderData.status === "hidden") return "admin.preview.hidden";
  if (loaderData.status === "sold_out") return "admin.preview.soldOut";
  if (loaderData.season === "scheduled" || loaderData.season === "ended") return "admin.preview.outOfSeason";
  return null;
}

/** The banner: read first (before the page), plain text, no landmark; never covers content. */
function PreviewBanner({ loaderData }: { loaderData: LoaderData }) {
  const { t } = useI18n();
  const note = statusNote(loaderData);
  const other: Locale = loaderData.lang === "fr" ? "en" : "fr";
  return (
    <div className="border-b-2 border-primary bg-card px-4 py-3">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 basis-60">
          <strong>{t("admin.preview.banner")}</strong> {note && <span>{t(note)}</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link to={loaderData.editUrl} className="inline-flex min-h-11 items-center gap-1 font-semibold link">
            <ChevronLeft aria-hidden="true" className="size-5" />
            {t("admin.preview.back")}
          </Link>
          <Link
            to={`?lang=${other}`}
            replace
            preventScrollReset
            lang={other}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-border px-3 font-semibold"
          >
            {t(`admin.preview.showIn.${other}`)}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ProductPreview({ loaderData }: Route.ComponentProps) {
  const shown = productView(loaderData.product, loaderData.lang);
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <PreviewBanner loaderData={loaderData} />
      <main id="main" tabIndex={-1} lang={loaderData.lang} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 outline-none md:py-10">
        <ProductArticle shown={shown} />
      </main>
    </div>
  );
}
