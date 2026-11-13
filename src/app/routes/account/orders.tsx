// `account/orders` (`/account/orders`, S-213; contracts.md): the signed-in customer's own orders,
// Current and Past, each with its status in words and a Track link. Customer only; filtered
// by the session's row AND the confirmed email (or manual orders), threat-model G-02.
import { Link, useRevalidator } from "react-router";
import { AccountFrame } from "~/components/account/account-ui";
import { Alert } from "~/components/ui/alert";
import { buttonVariants } from "~/components/ui/button";
import { formatOrderNumber } from "~/domain/order-number";
import { type OrderStatus, type StatusTone, statusTone } from "~/domain/status";
import { formatDayLabel, todayMU } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { type Locale, formatRupees, localePath } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { pageLocale, requireCustomer } from "~/server/customer-auth.server";
import { requestDbContext } from "~/server/db.server";
import { type AccountOrderRow, listAccountOrders } from "~/server/repos/customer-accounts.server";
import type { Route } from "./+types/orders";

/** Past = finished one way or another (AC1); everything else is Current. */
const PAST = new Set<OrderStatus>(["completed", "declined", "cancelled", "closed"]);

export interface OrderSummary {
  id: string;
  number: string;
  status: OrderStatus;
  fulfilment: "delivery" | "pickup";
  placedOn: string;
  fulfilOn: string;
  window: string;
  total: string;
  trackingUrl: string;
}

/** One card's text, formatted on the server in the page language and Mauritius time (AC10). */
function summarise(row: AccountOrderRow, locale: Locale): OrderSummary {
  return {
    id: row.id,
    number: formatOrderNumber(row.numberPrefix ?? "APB-", row.number),
    status: row.status,
    fulfilment: row.fulfilment,
    placedOn: formatDayLabel(todayMU(row.createdAt), locale),
    fulfilOn: formatDayLabel(row.fulfilOn, locale),
    window: localized(row.timeWindow.label, locale),
    total: formatRupees(row.totalRs, locale),
    trackingUrl: localePath(locale, `/t/${row.trackingToken}`),
  };
}

export async function loader(args: Route.LoaderArgs) {
  const customer = await requireCustomer(args);
  const locale = pageLocale(args);
  const rows = await listAccountOrders(args.context.get(requestDbContext).db, customer.id, customer.authEmail);
  const summaries = rows.map((row) => summarise(row, locale));
  return {
    title: translate("account.orders.title", locale),
    current: summaries.filter((order) => !PAST.has(order.status)),
    past: summaries.filter((order) => PAST.has(order.status)),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

const CHIP: Record<StatusTone, string> = {
  action: "border-warning",
  waiting: "border-info",
  progress: "border-success",
  done: "border-muted-foreground",
  stopped: "border-destructive",
};

/** Status as words in an outlined chip: never colour alone (AC8). */
function StatusChip({ status }: { status: OrderStatus }) {
  const { t } = useI18n();
  return (
    <span className={cn("inline-flex min-h-6 items-center rounded-full border-2 bg-background px-3 py-0.5 text-sm font-semibold", CHIP[statusTone(status)])}>
      {t(`account.orders.status.${status}`)}
    </span>
  );
}

function OrderCard({ order }: { order: OrderSummary }) {
  const { t } = useI18n();
  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-heading text-xl">{order.number}</h3>
        <StatusChip status={order.status} />
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">{t("account.orders.placed")}</dt>
        <dd>{order.placedOn}</dd>
        <dt className="text-muted-foreground">{t(`account.orders.fulfilment.${order.fulfilment}`)}</dt>
        <dd>
          {order.fulfilOn}, {order.window}
        </dd>
        <dt className="text-muted-foreground">{t("account.orders.total")}</dt>
        <dd className="font-semibold">{order.total}</dd>
      </dl>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={order.trackingUrl} aria-label={t("account.orders.trackName", { number: order.number })} className={buttonVariants({ variant: "outline" })}>
          {t("account.orders.track")}
        </Link>
      </div>
    </li>
  );
}

function OrderSection({ id, title, orders }: { id: string; title: string; orders: OrderSummary[] }) {
  if (orders.length === 0) return null;
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <ul className="mt-3 grid gap-3">
        {orders.map((order) => (
          <OrderCard key={order.id} order={order} />
        ))}
      </ul>
    </section>
  );
}

export default function Orders({ loaderData }: Route.ComponentProps) {
  const { t, locale } = useI18n();
  const { current, past } = loaderData;
  return (
    <AccountFrame title={t("account.orders.title")}>
      {current.length === 0 && past.length === 0 ? (
        <div className="rounded-card border border-border bg-card p-6 text-center">
          <p>{t("account.orders.empty")}</p>
          <Link to={localePath(locale, "/menu")} className={cn(buttonVariants({ size: "lg" }), "mt-4")}>
            {t("account.orders.orderNow")}
          </Link>
        </div>
      ) : (
        <>
          <OrderSection id="orders-current" title={t("account.orders.current")} orders={current} />
          <OrderSection id="orders-past" title={t("account.orders.past")} orders={past} />
        </>
      )}
    </AccountFrame>
  );
}

/** The list failed to load (AC7): a calm message and Retry, inside the site frame. */
export function ErrorBoundary() {
  const { t } = useI18n();
  const revalidator = useRevalidator();
  return (
    <Alert tone="danger" role="alert" title={t("account.orders.loadFailed")} className="mx-auto max-w-2xl">
      <button type="button" onClick={() => void revalidator.revalidate()} className={cn(buttonVariants({ variant: "outline" }), "mt-2")}>
        {t("account.orders.retry")}
      </button>
    </Alert>
  );
}
