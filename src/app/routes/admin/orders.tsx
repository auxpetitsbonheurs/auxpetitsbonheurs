import { data, isRouteErrorResponse, redirect, useLocation } from "react-router";
import { OrderList } from "~/components/admin/orders/order-list";
import { PaymentLists, PaymentMissing } from "~/components/admin/orders/payment-lists";
import { SearchAndFilters } from "~/components/admin/orders/search-filters";
import { OrdersTabs } from "~/components/admin/orders/tabs-nav";
import { listLinkClass } from "~/components/admin/orders/types";
import { Alert } from "~/components/ui/alert";
import { formatOrderNumber } from "~/domain/order-number";
import { type ListTab, isOrderTab } from "~/domain/order-tabs";
import { paymentDetailsMissing, timeLeft } from "~/domain/payment";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import type { Locale } from "~/lib/locale";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { pageLimit } from "~/server/contracts/admin";
import { NO_FILTERS, decodeListCursor, encodeListCursor, parseListFilters } from "~/server/contracts/orders-list";
import { type Executor, requestDbContext } from "~/server/db.server";
import { countTabs, cursorAfter, listTabOrders } from "~/server/repos/admin-order-list.server";
import { type AdminOrderItem, type AdminOrderRow, type PaymentOrderRow, itemsOfOrders, listPaymentOrders } from "~/server/repos/admin-orders.server";
import { getCheckoutSettings, readPaymentSettings } from "~/server/repos/settings.server";
import type { Route } from "./+types/orders";

const REVIEW_PATH = "/admin/orders?tab=review";

/** "1 × Chocolate cake", first two items, then "+n more" (admin-orders "Today" row rule). */
function itemsPreview(items: AdminOrderItem[] = [], locale: Locale): string[] {
  const shown = items.slice(0, 2).map((item) => translate("admin.orders.itemPreview", locale, { quantity: item.quantity, name: localized(item.name, locale) }));
  return items.length > 2 ? [...shown, translate("admin.orders.moreItems", locale, { count: items.length - 2 })] : shown;
}

/** "12 h left", "45 min left", "Cancelling soon" (S-279 AC1). */
function timeLeftLabel(createdAt: Date, now: Date, locale: Locale): { timeLeft: string; overdue: boolean } {
  const left = timeLeft(createdAt, now);
  if (left.kind === "overdue") return { timeLeft: translate("admin.orders.payment.overdue", locale), overdue: true };
  const key = left.kind === "hours" ? "admin.orders.payment.hoursLeft" : "admin.orders.payment.minutesLeft";
  return { timeLeft: translate(key, locale, { count: left.value }), overdue: false };
}

/** Names the page in the admin header (S-033 AC6). */
export const handle = { titleKey: "admin.nav.orders" };

interface ViewContext {
  locale: Locale;
  prefix: string;
  items: Map<string, AdminOrderItem[]>;
}

/** A list row as the page shows it: the number with the prefix stored at placement (S-058 AC6), the date and items in words. */
function rowView<T extends AdminOrderRow>({ numberPrefix, ...row }: T, view: ViewContext) {
  return {
    ...row,
    number: formatOrderNumber(numberPrefix ?? view.prefix, row.number),
    dateLabel: formatDayLabel(row.fulfilOn, view.locale),
    itemsPreview: itemsPreview(view.items.get(row.id), view.locale),
  };
}

async function viewContext(db: Executor, rows: AdminOrderRow[], locale: Locale): Promise<ViewContext> {
  const items = await itemsOfOrders(db, rows.map((row) => row.id));
  // Settings only for a row without a stored prefix.
  const prefix = rows.some((row) => row.numberPrefix === null) ? (await getCheckoutSettings(db as never)).orderNumberPrefix : "";
  return { locale, prefix, items };
}

/** The Payment tab's worklists (S-279), as built by the payment work. */
async function paymentTab(db: Executor, now: Date, locale: Locale) {
  const lists = await listPaymentOrders(db, now);
  const view = await viewContext(db, [...lists.awaiting, ...lists.refunds, ...lists.cancelled], locale);
  const shown = ({ createdAt: _createdAt, ...row }: PaymentOrderRow) => rowView(row, view);
  return {
    awaiting: lists.awaiting.map((row) => ({ ...shown(row), ...timeLeftLabel(row.createdAt, now, locale) })),
    refunds: lists.refunds.map(shown),
    cancelled: lists.cancelled.map(shown),
  };
}

const invalid = (locale: Locale) => data({ ok: false as const, error: { code: "VALIDATION_FAILED", message: translate("admin.orders.badAddress", locale) } }, { status: 400 });

/**
 * `admin/orders` loader (contracts.md, S-111, S-112): `tab` = review | payment | upcoming |
 * completed | closed, plus `counts` for every tab. List tabs take `q`, `fulfilment`, `paid`,
 * `from`/`to` (or `date`), `cursor`, `limit` (≤ 100) and answer `{ data, nextCursor, filters,
 * problems }`; a bad filter is reported on its field and left out. No tab redirects to To review;
 * an unknown tab or a bad cursor is VALIDATION_FAILED (400).
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const search = args.url.searchParams;
  const tab = search.get("tab");
  if (!tab) throw redirect(REVIEW_PATH);
  if (!isOrderTab(tab)) throw invalid(me.locale);
  const cursor = decodeListCursor(search.get("cursor"));
  if (cursor === "invalid") throw invalid(me.locale);
  const db = args.context.get(requestDbContext).db;
  const { filters, problems } = tab === "payment" ? { filters: NO_FILTERS, problems: {} } : parseListFilters(search);
  const limit = pageLimit(search.get("limit"));
  const [counts, paymentSettings] = await Promise.all([countTabs(db), readPaymentSettings(db)]);
  const common = {
    title: translate("admin.orders.listTitle", me.locale),
    counts,
    paymentMissing: paymentDetailsMissing(paymentSettings),
    canEditSettings: me.role === "owner",
    filters,
    problems,
    typed: (search.get("q") ?? "").slice(0, 200),
  };
  if (tab === "payment") {
    return { ...common, tab, data: [], nextCursor: null, limit, payment: await paymentTab(db, args.context.get(clockContext).now(), me.locale) };
  }
  const { rows, more } = await listTabOrders(db, { tab, filters, after: cursor, limit });
  const view = await viewContext(db, rows, me.locale);
  const last = rows.at(-1);
  return { ...common, tab, data: rows.map((row) => rowView(row, view)), nextCursor: more && last ? encodeListCursor(cursorAfter(tab, last)) : null, limit, payment: null };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { tab, counts, payment, paymentMissing, canEditSettings, filters, problems, typed, data: rows, nextCursor } = loaderData;
  const listTab = tab as ListTab;
  return (
    <>
      <h1>{t("admin.orders.listTitle")}</h1>
      <OrdersTabs tab={tab} counts={counts} />
      {paymentMissing && <PaymentMissing canEditSettings={canEditSettings} />}
      {payment ? (
        <PaymentLists payment={payment} />
      ) : (
        <>
          <SearchAndFilters tab={listTab} filters={filters} problems={problems} typed={typed} />
          <OrderList key={`${tab}:${JSON.stringify(filters)}:${rows[0]?.id ?? ""}`} tab={listTab} filters={filters} first={{ data: rows, nextCursor }} />
        </>
      )}
    </>
  );
}

/** List failed (S-111 AC7): an Alert with Retry; a bad address (400) offers the default tab. */
export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  const location = useLocation();
  const bad = isRouteErrorResponse(error) && error.status === 400;
  return (
    <>
      <h1>{t("admin.orders.listTitle")}</h1>
      <Alert tone="danger" role="alert" className="mt-6">
        <p className="font-semibold">{bad ? t("admin.orders.badAddress") : t("admin.orders.loadFailed")}</p>
        <a href={bad ? REVIEW_PATH : `${location.pathname}${location.search}`} className={listLinkClass}>
          {bad ? t("admin.orders.backToList") : t("admin.orders.retry")}
        </a>
      </Alert>
    </>
  );
}
