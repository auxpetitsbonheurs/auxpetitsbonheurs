import { CircleCheck, CircleDashed } from "lucide-react";
import { StatusBadge } from "~/components/order/status-badge";
import { tabOf } from "~/domain/order-tabs";
import { useI18n } from "~/i18n/react";
import type { OrderLoaderData } from "~/routes/admin/order";
import { useOrderAction } from "./use-order-action";

export const orderLinkClass = "inline-flex min-h-11 items-center font-semibold link wrap-anywhere";

/** "Paid" / "Unpaid" tag: icon + word, never colour alone. */
export function PaidTag({ paid }: { paid: boolean }) {
  const { t } = useI18n();
  const Icon = paid ? CircleCheck : CircleDashed;
  return (
    <span className="inline-flex min-h-6 items-center gap-1.5 rounded-full border-2 border-border bg-background px-3 py-0.5 text-sm font-semibold">
      <Icon aria-hidden="true" className={paid ? "size-4 text-success" : "size-4 text-muted-foreground"} />
      {paid ? t("admin.order.paidTag") : t("admin.order.unpaidTag")}
    </span>
  );
}

/** Number, status badge and Paid tag (both optimistic while an action is in flight), source, placed time (S-113 AC1). */
export function OrderHeader({ data: { order, allowed, payment } }: { data: OrderLoaderData }) {
  const { t } = useI18n();
  const { optimistic } = useOrderAction(order, allowed);
  // Orders waiting for their payment or a refund live in the Payment tab (S-279, S-281).
  const toPayment = order.status === "awaiting_payment" || allowed.markRefunded;
  return (
    <>
      <p>
        <a href={`/admin/orders?tab=${toPayment ? "payment" : tabOf(order.status)}`} className={orderLinkClass}>
          {toPayment ? t("admin.order.backPayment") : t("admin.order.backToOrders")}
        </a>
      </p>
      <h1 className="mt-2">{t("admin.order.title", { number: order.number })}</h1>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <span className="sr-only">{t("admin.order.status")}:</span>
        <span data-testid="order-status">
          <StatusBadge status={optimistic.status} audience="admin" />
        </span>
        <PaidTag paid={optimistic.paid} />
        {payment.cancelledUnpaid && <span className="text-sm font-semibold">{t("admin.payment.cancelledUnpaid")}</span>}
        <span className="text-sm">{t(`admin.orders.sourceName.${order.source}`)}</span>
        <span className="text-sm">{t("admin.order.placedAt", { time: order.placedAt })}</span>
      </div>
    </>
  );
}
