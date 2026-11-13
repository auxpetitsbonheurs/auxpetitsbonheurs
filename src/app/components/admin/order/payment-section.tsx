import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { Section } from "./sections";

/** Juice payment state (S-279, S-281): awaiting with the deadline, paid, refund due or sent. */
export function PaymentSection({ data: { order, payment } }: { data: OrderLoaderData }) {
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <Section id="payment-heading" title={t("admin.order.paymentTitle")}>
      <div className="mt-3 grid gap-1">
        {payment.awaiting ? (
          <>
            <p className="font-semibold">{t("admin.order.paymentAwaiting", { reference: order.number })}</p>
            <p>{t("admin.order.paymentDeadline", { time: payment.deadlineLabel, left: payment.timeLeft })}</p>
          </>
        ) : payment.paidLabel ? (
          <p className="font-semibold">{t("admin.order.paymentPaid", { amount, time: payment.paidLabel })}</p>
        ) : (
          <p>{payment.cancelledUnpaid ? t("admin.payment.cancelledUnpaid") : t("admin.order.paymentUnpaid")}</p>
        )}
        {order.status === "declined" && payment.declineReason && <p className="wrap-anywhere">{t("admin.order.declineReasonShown", { reason: payment.declineReason })}</p>}
        {payment.refund?.refundedLabel && <p className="font-semibold">{t("admin.order.refundedAt", { amount: formatRupees(payment.refund.amountRs), time: payment.refund.refundedLabel })}</p>}
      </div>
    </Section>
  );
}
