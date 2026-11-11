import { CakeSlice, Ellipsis, Plus } from "lucide-react";
import { useState } from "react";
import { Link, isRouteErrorResponse, useRevalidator, useRouteError } from "react-router";
import { AdminErrorBoundary } from "~/components/admin/admin-states";
import { Alert } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { PRODUCT_TYPES, type ProductType } from "~/domain/product";
import { todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Translate } from "~/i18n/translator";
import { type Locale, formatRupees } from "~/lib/locale";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { requestDbContext } from "~/server/db.server";
import { publicConfigContext } from "~/server/public-config.server";
import { type AdminMenuRow, listAdminMenu } from "~/server/repos/admin-menu.server";
import { timed } from "~/server/server-timing.server";
import type { Route } from "./+types/menu";

/** `admin/menu` (FR-061): every product by type, with its row actions. */
export const handle = { titleKey: "admin.nav.menu" };

/** `admin/menu` loader (contracts.md): `{ title, byType }`, groups in PRODUCT_TYPES order. */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const { context } = args;
  const byType = await timed(context, "menu", () =>
    listAdminMenu(context.get(requestDbContext).db, {
      today: todayMU(context.get(clockContext).now()),
      supabaseUrl: context.get(publicConfigContext).supabaseUrl,
    }),
  );
  return { title: translate(handle.titleKey, me.locale), byType };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

/** A row's text in the admin's language: name with English fallback, "Rs 850", tags as words. */
export function rowView(row: AdminMenuRow, locale: Locale, t: Translate) {
  const tags: string[] = [];
  if (row.status !== "available") tags.push(t(`admin.menu.tag.${row.status}`));
  if (row.seasonal) tags.push(t(`admin.menu.tag.seasonal_${row.seasonal}`));
  return { name: localized(row.name, locale), price: formatRupees(row.fromPriceRs, locale), tags };
}

/** Load failure (S-041 AC3): the page keeps its heading and offers Retry; 403/404 as any admin page. */
export function ErrorBoundary(props: Route.ErrorBoundaryProps) {
  const error = useRouteError();
  const { t } = useI18n();
  const revalidator = useRevalidator();
  if (isRouteErrorResponse(error) && (error.status === 403 || error.status === 404)) return <AdminErrorBoundary error={props.error} />;
  return (
    <>
      <h1>{t("admin.nav.menu")}</h1>
      <Alert tone="danger" role="alert" title={t("admin.menu.loadFailedTitle")} className="mt-6">
        <p>{t("admin.menu.loadFailedBody")}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void revalidator.revalidate()} aria-busy={revalidator.state === "loading" || undefined}>
          {t("admin.states.retry")}
        </Button>
      </Alert>
    </>
  );
}

function RowPhoto({ url }: { url: string | null }) {
  // Decorative: the name is the row's text (S-041 AC5).
  if (!url) {
    return (
      <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-decorative">
        <CakeSlice aria-hidden="true" className="size-6 text-muted-foreground" />
      </span>
    );
  }
  return <img src={url} alt="" width={56} height={56} loading="lazy" className="size-14 shrink-0 rounded-md bg-decorative object-cover" />;
}

function ProductRow({ row, onActions }: { row: AdminMenuRow; onActions: (row: AdminMenuRow) => void }) {
  const { t, locale } = useI18n();
  const view = rowView(row, locale, t);
  return (
    // Wraps at 200% zoom on a 320 px phone: the name takes its own line rather than a sliver.
    <li className="flex min-h-20 flex-wrap items-center gap-3 p-3" data-status={row.status}>
      <RowPhoto url={row.imageUrl} />
      <div className="min-w-0 flex-[1_1_8rem]">
        <Link to={`/admin/menu/${row.id}`} prefetch="intent" className="inline-flex min-h-11 items-center font-semibold wrap-anywhere hover:underline">
          {view.name}
        </Link>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="whitespace-nowrap tabular-nums">{t("admin.menu.fromPrice", { price: view.price })}</span>
          {view.tags.map((tag) => (
            <span key={tag} className="rounded-sm border border-input px-1.5 font-semibold">
              {tag}
            </span>
          ))}
        </p>
      </div>
      <Button type="button" variant="ghost" size="icon" aria-label={t("admin.menu.actionsFor", { name: view.name })} onClick={() => onActions(row)}>
        <Ellipsis aria-hidden="true" />
      </Button>
    </li>
  );
}

function AddProductLink({ type, label }: { type: ProductType; label: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="mt-3">
      <Link to={`/admin/menu/new?type=${type}`}>
        <Plus aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}

function TypeGroup({ type, rows, onActions }: { type: ProductType; rows: AdminMenuRow[]; onActions: (row: AdminMenuRow) => void }) {
  const { t } = useI18n();
  const headingId = `group-${type}`;
  return (
    <section aria-labelledby={headingId} className="mt-8">
      <h2 id={headingId} className="text-h2">
        {t(`admin.menu.group.${type}`)}
      </h2>
      {rows.length === 0 ? (
        <div className="mt-3 rounded-card border border-border bg-card p-4">
          <p>{t(`admin.menu.empty.${type}`)}</p>
          <AddProductLink type={type} label={t("admin.menu.addProduct")} />
        </div>
      ) : (
        <ul aria-labelledby={headingId} className="mt-3 divide-y divide-border overflow-hidden rounded-card border border-border bg-card">
          {rows.map((row) => (
            <ProductRow key={row.id} row={row} onActions={onActions} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RowActions({ row, onClose }: { row: AdminMenuRow | null; onClose: () => void }) {
  const { t, locale } = useI18n();
  const name = row ? localized(row.name, locale) : "";
  return (
    <Modal open={row !== null} onClose={onClose} title={name} closeLabel={t("admin.states.close")}>
      {row && (
        <ul className="grid gap-2">
          <li>
            <Button asChild variant="outline" className="w-full">
              <Link to={`/admin/menu/${row.id}`}>{t("admin.menu.edit")}</Link>
            </Button>
          </li>
        </ul>
      )}
    </Modal>
  );
}

export default function AdminMenu({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<AdminMenuRow | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>{loaderData.title}</h1>
        <Button asChild size="sm">
          <Link to="/admin/menu/new">
            <Plus aria-hidden="true" />
            {t("admin.menu.addProduct")}
          </Link>
        </Button>
      </div>
      {PRODUCT_TYPES.map((type) => (
        <TypeGroup key={type} type={type} rows={loaderData.byType[type]} onActions={setSelected} />
      ))}
      <RowActions row={selected} onClose={() => setSelected(null)} />
    </>
  );
}
