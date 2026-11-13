import { redirect } from "react-router";
import { StatusBadge } from "~/components/order/status-badge";
import { Alert } from "~/components/ui/alert";
import { formatOrderNumber } from "~/domain/order-number";
import { paymentDetailsMissing, timeLeft } from "~/domain/payment";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { requireAdmin } from "~/server/auth.server";
import { clockContext } from "~/server/clock.server";
import { decodeCursor, encodeCursor, pageLimit } from "~/server/contracts/admin";
import { requestDbContext } from "~/server/db.server";
import { type AdminOrderItem, type AdminOrderRow, type PaymentOrderRow, itemsOfOrders, listPaymentOrders, listReviewOrders } from "~/server/repos/admin-orders.server";
import { getCheckoutSettings, readPaymentSettings } from "~/server/repos/settings.server";
import type { Route } from "./+types/orders";

const REVIEW_PATH = "/admin/orders?tab=review";
const PAYMENT_PATH = "/admin/orders?tab=payment";
const TABS = ["review", "payment"] as const;
type Tab = (typeof TABS)[number];

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

async function viewContext(db: Parameters<typeof itemsOfOrders>[0], rows: AdminOrderRow[], locale: Locale): Promise<ViewContext> {
  const items = await itemsOfOrders(db, rows.map((row) => row.id));
  // Settings only for a row without a stored prefix.
  const prefix = rows.some((row) => row.numberPrefix === null) ? (await getCheckoutSettings(db as never)).orderNumberPrefix : "";
  return { locale, prefix, items };
}

/**
 * `admin/orders` loader: tab `review` (pending_approval, quote_needed, oldest first, 30 per page
 * with a cursor) or tab `payment` (S-279: awaiting payment with the time left, refunds to send,
 * unpaid cancellations of the last 7 days). Both warn while the Juice details are missing
 * (S-277 AC5). Search, filters and the other tabs are E-06.
 */
export async function loader(args: Route.LoaderArgs) {
  const me = await requireAdmin(args);
  const search = args.url.searchParams;
  const tab = search.get("tab");
  if (!TABS.includes(tab as Tab)) throw redirect(REVIEW_PATH);
  const db = args.context.get(requestDbContext).db;
  const now = args.context.get(clockContext).now();
  const common = {
    title: translate("admin.orders.metaTitle", me.locale),
    paymentMissing: paymentDetailsMissing(await readPaymentSettings(db)),
    canEditSettings: me.role === "owner",
  };
  const limit = pageLimit(search.get("limit"));
  if (tab === "payment") {
    const lists = await listPaymentOrders(db, now);
    const all = [...lists.awaiting, ...lists.refunds, ...lists.cancelled];
    const view = await viewContext(db, all, me.locale);
    const shown = ({ createdAt: _createdAt, ...row }: PaymentOrderRow) => rowView(row, view);
    const payment = {
      awaiting: lists.awaiting.map((row) => ({ ...shown(row), ...timeLeftLabel(row.createdAt, now, me.locale) })),
      refunds: lists.refunds.map(shown),
      cancelled: lists.cancelled.map(shown),
    };
    return { ...common, tab: "payment" as const, data: [], nextCursor: null, limit, payment };
  }
  const { rows, more } = await listReviewOrders(db, { after: decodeCursor(search.get("cursor")), limit });
  const view = await viewContext(db, rows, me.locale);
  const last = rows.at(-1);
  return { ...common, tab: "review" as const, data: rows.map((row) => rowView(row, view)), nextCursor: more && last ? encodeCursor(last.number) : null, limit, payment: null };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type LoaderData = Route.ComponentProps["loaderData"];
type OrderRowView = LoaderData["data"][number];
type PaymentRowView = NonNullable<LoaderData["payment"]>["refunds"][number] & { timeLeft?: string; overdue?: boolean };

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

const linkClass = "inline-flex min-h-11 items-center font-semibold link";

function OrderCard({ order, badge, level = 2 }: { order: OrderRowView | PaymentRowView; badge?: React.ReactNode; level?: 2 | 3 }) {
  const { t, locale } = useI18n();
  const Heading = level === 3 ? "h3" : "h2";
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading className="text-xl">
          <a href={`/admin/orders/${order.id}`} className={linkClass}>
            {t("admin.orders.orderLink", { number: order.number })}
          </a>
        </Heading>
        {badge ?? <StatusBadge status={order.status} />}
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

/** Time-left badge (S-279 AC1): words always, the warning tone once overdue. */
function TimeLeftBadge({ text, overdue }: { text: string; overdue: boolean }) {
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border-2 bg-background px-3 py-0.5 text-sm font-semibold tabular-nums", overdue ? "border-destructive" : "border-warning")}>
      {text}
    </span>
  );
}

function PaymentMissing({ canEditSettings }: { canEditSettings: boolean }) {
  const { t } = useI18n();
  return (
    <Alert tone="warning" title={t("admin.payment.missingTitle")} className="mt-6" data-testid="payment-missing">
      <p>{t("admin.payment.missingBody")}</p>
      {canEditSettings ? (
        <a href="/admin/settings#payment-title" className={linkClass}>
          {t("admin.payment.missingLink")}
        </a>
      ) : (
        <p className="mt-1">{t("admin.payment.missingAdmin")}</p>
      )}
    </Alert>
  );
}

function Tabs({ tab }: { tab: Tab }) {
  const { t } = useI18n();
  const item = (key: Tab, href: string, label: string) => (
    <li>
      <a
        href={href}
        aria-current={tab === key ? "page" : undefined}
        className={cn("inline-flex min-h-11 items-center rounded-md border-2 px-4 font-semibold", tab === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card")}
      >
        {label}
      </a>
    </li>
  );
  return (
    <nav aria-label={t("admin.orders.tabsLabel")} className="mt-4">
      <ul className="flex flex-wrap gap-2">
        {item("review", REVIEW_PATH, t("admin.orders.tabReview"))}
        {item("payment", PAYMENT_PATH, t("admin.orders.tabPayment"))}
      </ul>
    </nav>
  );
}

function PaymentLists({ payment }: { payment: NonNullable<LoaderData["payment"]> }) {
  const { t } = useI18n();
  return (
    <>
      <section aria-labelledby="awaiting-heading" className="mt-6">
        <h2 id="awaiting-heading" className="text-h2">
          {t("admin.orders.payment.awaitingTitle")}
        </h2>
        {payment.awaiting.length === 0 ? (
          <p className="mt-3 text-lg">{t("admin.orders.payment.awaitingEmpty")}</p>
        ) : (
          <ul className="mt-3 grid gap-4" aria-labelledby="awaiting-heading">
            {payment.awaiting.map((order) => (
              <OrderCard key={order.id} level={3} order={order} badge={<TimeLeftBadge text={order.timeLeft} overdue={order.overdue} />} />
            ))}
          </ul>
        )}
      </section>
      {payment.refunds.length > 0 && (
        <section aria-labelledby="refunds-heading" className="mt-8">
          <h2 id="refunds-heading" className="text-h2">
            {t("admin.orders.payment.refundsTitle")}
          </h2>
          <ul className="mt-3 grid gap-4" aria-labelledby="refunds-heading">
            {payment.refunds.map((order) => (
              <OrderCard key={order.id} level={3} order={order} badge={<TimeLeftBadge text={t("admin.orders.payment.refundLine", { amount: formatRupees(order.refundDueRs ?? 0) })} overdue />} />
            ))}
          </ul>
        </section>
      )}
      {payment.cancelled.length > 0 && (
        <section aria-labelledby="cancelled-heading" className="mt-8">
          <h2 id="cancelled-heading" className="text-h2">
            {t("admin.orders.payment.cancelledTitle")}
          </h2>
          <ul className="mt-3 grid gap-4" aria-labelledby="cancelled-heading">
            {payment.cancelled.map((order) => (
              <OrderCard key={order.id} level={3} order={order} badge={<TimeLeftBadge text={t("admin.payment.cancelledUnpaid")} overdue />} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export default function AdminOrders({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { data, nextCursor, tab, payment, paymentMissing, canEditSettings } = loaderData;
  return (
    <>
      <h1>{tab === "payment" ? t("admin.order.backPayment") : t("admin.orders.title")}</h1>
      <Tabs tab={tab} />
      {paymentMissing && <PaymentMissing canEditSettings={canEditSettings} />}
      {payment ? (
        <PaymentLists payment={payment} />
      ) : data.length === 0 ? (
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
          <a href={`${REVIEW_PATH}&cursor=${encodeURIComponent(nextCursor)}`} className={linkClass}>
            {t("admin.orders.more")}
          </a>
        </p>
      )}
    </>
  );
}
