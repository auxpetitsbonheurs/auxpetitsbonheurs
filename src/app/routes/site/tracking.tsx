import { data, isRouteErrorResponse, redirect } from "react-router";
import { OrderNotFound } from "~/components/order/order-not-found";
import { StatusBadge } from "~/components/order/status-badge";
import { StatusProgress } from "~/components/order/status-progress";
import { Alert } from "~/components/ui/alert";
import { formatOrderNumber } from "~/domain/order-number";
import { customerProgress } from "~/domain/status";
import { formatDayLabel } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees, localeFromPathname } from "~/lib/locale";
import { requestDbContext } from "~/server/db.server";
import { findTrackedOrder } from "~/server/repos/orders.server";
import { getCheckoutSettings } from "~/server/repos/settings.server";
import { isTrackingToken, orderLanguageRedirect, tokenPageHeaders } from "~/server/token-page.server";
import type { Route } from "./+types/tracking";

/** no-store, noindex, no-referrer on every response of this route (NFR-004, threat-model G-07). */
export const middleware: Route.MiddlewareFunction[] = [tokenPageHeaders];

/**
 * `site/tracking` loader (contracts.md; minimal slice: order summary, items, `payment`,
 * `progress`). No contact details are returned: the link may be forwarded. The format is
 * checked before the database; wrong and unknown tokens share one 404 path (FR-026).
 */
export async function loader({ request, url, params, context }: Route.LoaderArgs) {
  if (!isTrackingToken(params.token)) throw data(null, { status: 404 });
  const db = context.get(requestDbContext).db;
  const order = await findTrackedOrder(db, params.token);
  if (!order) throw data(null, { status: 404 });
  const moveTo = orderLanguageRedirect(request, url, order.locale);
  if (moveTo) throw redirect(moveTo);
  const locale = localeFromPathname(url.pathname);
  const settings = await getCheckoutSettings(db);
  const { id: _id, locale: _orderLocale, number, ...shown } = order;
  return {
    title: translate("order.tracking.metaTitle", locale),
    order: { ...shown, number: formatOrderNumber(settings.orderNumberPrefix, number), dateLabel: formatDayLabel(order.fulfilOn, locale) },
    payment: settings.payment,
    progress: customerProgress(order.status, order.fulfilment),
  };
}

export function meta({ loaderData }: Route.MetaArgs) {
  return [{ title: `${loaderData?.title ?? ""} | Aux petits bonheurs` }, { name: "robots", content: "noindex, nofollow" }];
}

type TrackedView = Route.ComponentProps["loaderData"]["order"];

const row = "flex flex-wrap justify-between gap-x-4";
const money = (amount: number) => <span className="whitespace-nowrap tabular-nums">{formatRupees(amount)}</span>;

function Fact({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="font-semibold">{term}</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

function OrderFacts({ order }: { order: TrackedView }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <dl className="mt-4 grid gap-3">
      <Fact term={t("order.tracking.date")}>{order.dateLabel}</Fact>
      <Fact term={t("order.tracking.time")}>{windowText}</Fact>
      <Fact term={t("order.tracking.fulfilment")}>{order.fulfilment === "delivery" ? t("order.tracking.delivery") : t("order.tracking.pickup")}</Fact>
      {order.address && <Fact term={t("order.tracking.address")}>{order.address}</Fact>}
      {order.landmark && <Fact term={t("order.tracking.landmark")}>{order.landmark}</Fact>}
    </dl>
  );
}

function ItemsAndTotal({ order }: { order: TrackedView }) {
  const { t, locale } = useI18n();
  return (
    <div className="mt-6 grid gap-2 rounded-lg bg-muted p-5">
      <ul className="grid gap-2">
        {order.items.map((item, index) => (
          <li key={index}>
            <p className={row}>
              <span>{t("checkout.itemLine", { name: localized(item.name, locale), quantity: item.quantity })}</span>
              {money(item.lineTotalRs)}
            </p>
            {item.options.length > 0 && <p className="text-sm">{item.options.map((o) => localized(o.label, locale)).join(", ")}</p>}
            {item.cakeMessage && <p className="text-sm">{t("order.tracking.cakeMessage", { message: item.cakeMessage })}</p>}
          </li>
        ))}
      </ul>
      {order.fulfilment === "delivery" ? (
        <p className={row}>
          <span>{t("checkout.feeLine")}</span>
          {money(order.deliveryFeeRs)}
        </p>
      ) : (
        <p>{t("checkout.pickupFree")}</p>
      )}
      <p className={`${row} border-t border-input pt-2 text-lg font-semibold`}>
        <span>{t("checkout.total")}</span>
        {money(order.totalRs)}
      </p>
    </div>
  );
}

export default function Tracking({ loaderData }: Route.ComponentProps) {
  const { t } = useI18n();
  const { order, payment, progress } = loaderData;
  return (
    <>
      <h1>{t("order.tracking.heading", { number: order.number })}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="sr-only">{t("order.tracking.status")}:</span>
        <StatusBadge status={order.status} />
        <span className="inline-flex min-h-6 items-center rounded-full border-2 border-input bg-background px-3 py-0.5 text-sm font-semibold">
          {order.paid ? t("order.tracking.paid") : t("order.tracking.unpaid")}
        </span>
      </div>
      {order.status === "pending_approval" && (
        <Alert tone="info" title={t("order.confirmed.notConfirmedTitle")} className="mt-6">
          <p>{t("order.confirmed.notConfirmedBody")}</p>
        </Alert>
      )}
      {progress ? <StatusProgress steps={progress.steps} current={progress.current} /> : <p className="mt-6 max-w-measure">{t("order.tracking.otherStatusHint")}</p>}
      <section aria-labelledby="details-heading" className="mt-8">
        <h2 id="details-heading" className="text-h2">
          {t("order.tracking.detailsTitle")}
        </h2>
        <OrderFacts order={order} />
        <ItemsAndTotal order={order} />
      </section>
      <section aria-labelledby="payment-heading" className="mt-8">
        <h2 id="payment-heading" className="text-h2">
          {t("order.tracking.paymentTitle")}
        </h2>
        <p className="mt-2 max-w-measure">{payment.juiceNumber ? t("checkout.paymentJuice", { number: payment.juiceNumber }) : t("checkout.paymentCash")}</p>
      </section>
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { t } = useI18n();
  if (isRouteErrorResponse(error) && error.status === 404) return <OrderNotFound />;
  return (
    <>
      <h1>{t("errors.genericTitle")}</h1>
      <p className="mt-4">{t("errors.genericBody")}</p>
    </>
  );
}
