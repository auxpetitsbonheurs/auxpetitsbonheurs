import { redirect } from "react-router";
import { StatusBadge } from "~/components/order/status-badge";
import { formatOrderNumber } from "~/domain/order-number";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees } from "~/lib/locale";
import { requireAdmin } from "~/server/auth.server";
import { decodeCursor, encodeCursor, pageLimit } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { type AdminOrderItem, itemsOfOrders, listReviewOrders } from "~/server/repos/admin-orders.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import type { Route } from "./+types/orders";

const REVIEW_PATH = "/admin/orders?tab=review";

/** "1 × Chocolate cake", first two items, then "+n more" (admin-orders "Today" row rule). */
function itemsPreview(items: AdminOrderItem[] = [], locale: Locale): string[] {
  const shown = items.slice(0, 2).map((item) => translate("admin.orders.itemPreview", locale, { quantity: item.quantity, name: localized(item.name, locale) }));
  return items.length > 2 ? [...shown, translate("admin.orders.moreItems", locale, { count: items.length - 2 })] : shown;
}

/**
 * `admin/orders` loader, minimal slice: tab `review` only (pending_approval, quote_needed),
 * oldest first (a queue: the longest wait is served first), 30 per page with a cursor. Search, filters, counts and the other tabs are E-06.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const search = args.url.searchParams;
  if (search.get("tab") !== "review") throw redirect(REVIEW_PATH);
  const db = args.context.get(requestDbContext).db;
  const limit = pageLimit(search.get("limit"));
  const { rows, more } = await listReviewOrders(db, { after: decodeCursor(search.get("cursor")), limit });
  const items = await itemsOfOrders(db, rows.map((row) => row.id));
  const { orderNumberPrefix } = await getCheckoutSettings(db);
  const data = rows.map((row) => ({
    ...row,
    number: formatOrderNumber(orderNumberPrefix, row.number),
    dateLabel: formatDayLabel(row.fulfilOn, me.locale),
    itemsPreview: itemsPreview(items.get(row.id), me.locale),
  }));
  const last = rows.at(-1);
  return {
    title: translate("admin.orders.metaTitle", me.locale),
    data,
    nextCursor: more && last ? encodeCursor(last.number) : null,
    limit,
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type OrderRowView = Route.ComponentProps["loaderData"]["data"][number];

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

function OrderCard({ order }: { order: OrderRowView }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xl">
          <a href={`/admin/orders/${order.id}`} className="inline-flex min-h-11 items-center font-semibold link">
            {t("admin.orders.orderLink", { number: order.number })}
          </a>
        </h2>
        <StatusBadge status={order.status} />
      </div>
      <dl className="mt-2 grid gap-1">
        <Fact term={t("admin.orders.customer")}>{order.contactName}</Fact>
        <Fact term={t("admin.orders.date")}>{order.dateLabel}</Fact>
        <Fact term={t("admin.orders.time")}>{windowText}</Fact>
        <Fact term={t("admin.orders.items")}>{order.itemsPreview.join(", ")}</Fact>
        <Fact term={t("admin.orders.total")}>
          <span className="whitespace-nowrap tabular-nums">{formatRupees(order.totalRs)}</span>
        </Fact>
        <Fact term={t("admin.orders.source")}>{t(`admin.orders.sourceName.${order.source}`)}</Fact>
      </dl>
    </li>
  );
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { data, nextCursor } = loaderData;
  return (
    <>
      <h1>{t("admin.orders.title")}</h1>
      {data.length === 0 ? (
        <p className="mt-6 text-lg">{t("admin.orders.empty")}</p>
      ) : (
        <ul className="mt-6 grid gap-4" aria-label={t("admin.orders.title")}>
          {data.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </ul>
      )}
      {nextCursor && (
        <p className="mt-6">
          <a href={`${REVIEW_PATH}&cursor=${encodeURIComponent(nextCursor)}`} className="inline-flex min-h-11 items-center font-semibold link">
            {t("admin.orders.more")}
          </a>
        </p>
      )}
    </>
  );
}
