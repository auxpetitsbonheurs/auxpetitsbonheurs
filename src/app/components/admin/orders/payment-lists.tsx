// The Payment tab (juice-payment spec, S-279): moved here unchanged from the route by E-06 so
// the route can also host the list tabs.
import type { ReactNode } from "react";
import { StatusBadge } from "~/components/order/status-badge";
import { Alert } from "~/components/ui/alert";
import { localized } from "~/i18n/localized";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import { cn } from "~/lib/utils";
import { type OrderRowView, listLinkClass } from "./types";

export type PaymentRowView = OrderRowView & { refundDueRs?: number | null; timeLeft?: string; overdue?: boolean };

export interface PaymentListsData {
  awaiting: (PaymentRowView & { timeLeft: string; overdue: boolean })[];
  refunds: PaymentRowView[];
  cancelled: PaymentRowView[];
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold">{term}:</dt>
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

function OrderCard({ order, badge }: { order: PaymentRowView; badge?: ReactNode }) {
  const { t, locale } = useI18n();
  const windowText = t("checkout.windowLabel", { label: localized(order.window.label, locale), start: order.window.start, end: order.window.end });
  return (
    <li className="rounded-card border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xl">
          <a href={`/admin/orders/${order.id}`} className={listLinkClass}>
            {t("admin.orders.orderLink", { number: order.number })}
          </a>
        </h3>
        {badge ?? <StatusBadge status={order.status} audience="admin" />}
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

export function PaymentMissing({ canEditSettings }: { canEditSettings: boolean }) {
  const { t } = useI18n();
  return (
    <Alert tone="warning" title={t("admin.payment.missingTitle")} className="mt-6" data-testid="payment-missing">
      <p>{t("admin.payment.missingBody")}</p>
      {canEditSettings ? (
        <a href="/admin/settings#payment-title" className={listLinkClass}>
          {t("admin.payment.missingLink")}
        </a>
      ) : (
        <p className="mt-1">{t("admin.payment.missingAdmin")}</p>
      )}
    </Alert>
  );
}

function PaymentSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-8 first:mt-6">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PaymentLists({ payment }: { payment: PaymentListsData }) {
  const { t } = useI18n();
  return (
    <>
      <PaymentSection id="awaiting-heading" title={t("admin.orders.payment.awaitingTitle")}>
        {payment.awaiting.length === 0 ? (
          <p className="mt-3 text-lg">{t("admin.orders.payment.awaitingEmpty")}</p>
        ) : (
          <ul className="mt-3 grid gap-4" aria-labelledby="awaiting-heading">
            {payment.awaiting.map((order) => (
              <OrderCard key={order.id} order={order} badge={<TimeLeftBadge text={order.timeLeft} overdue={order.overdue} />} />
            ))}
          </ul>
        )}
      </PaymentSection>
      {payment.refunds.length > 0 && (
        <PaymentSection id="refunds-heading" title={t("admin.orders.payment.refundsTitle")}>
          <ul className="mt-3 grid gap-4" aria-labelledby="refunds-heading">
            {payment.refunds.map((order) => (
              <OrderCard key={order.id} order={order} badge={<TimeLeftBadge text={t("admin.orders.payment.refundLine", { amount: formatRupees(order.refundDueRs ?? 0) })} overdue />} />
            ))}
          </ul>
        </PaymentSection>
      )}
      {payment.cancelled.length > 0 && (
        <PaymentSection id="cancelled-heading" title={t("admin.orders.payment.cancelledTitle")}>
          <ul className="mt-3 grid gap-4" aria-labelledby="cancelled-heading">
            {payment.cancelled.map((order) => (
              <OrderCard key={order.id} order={order} badge={<TimeLeftBadge text={t("admin.payment.cancelledUnpaid")} overdue />} />
            ))}
          </ul>
        </PaymentSection>
      )}
    </>
  );
}
