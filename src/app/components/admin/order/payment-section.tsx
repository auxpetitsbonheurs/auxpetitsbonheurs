import { MessageCircle } from "lucide-react";
import { buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { Section } from "./sections";

/** The resolved "Payment details" WhatsApp message of this order (S-201 menu, approve-then-pay), or null. */
export function paymentWhatsappUrl(data: OrderLoaderData): string | null {
  return data.whatsapp.templates?.find((item) => item.key === "payment_instructions")?.url ?? null;
}

/**
 * One tap after approving (approve-then-pay, 2026-11-14): opens WhatsApp with the payment details
 * prefilled in the order's language, from the Settings template. Nothing is sent by the app.
 */
export function SendPaymentWhatsapp({ data, className }: { data: OrderLoaderData; className?: string }) {
  const { t } = useI18n();
  const url = paymentWhatsappUrl(data);
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: "outline", size: "lg", className: `h-auto min-h-12 max-w-full whitespace-normal max-[22rem]:px-2 ${className ?? ""}` })}
    >
      {/* At 320 px and 200% zoom the column is ~100 px: the words wrap and the icon steps aside. */}
      <MessageCircle aria-hidden="true" className="max-[22rem]:hidden" />
      {t("admin.order.sendPaymentWhatsapp")}
      <span className="sr-only"> {t("order.payment.opensWhatsapp")}</span>
    </a>
  );
}

/** Juice payment state (S-279, S-281): pending approval, awaiting with the deadline, paid, refund due or sent. */
export function PaymentSection({ data }: { data: OrderLoaderData }) {
  const { order, payment } = data;
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <Section id="payment-heading" title={t("admin.order.paymentTitle")}>
      <div className="mt-3 grid gap-1">
        {payment.awaiting ? (
          <>
            <p className="font-semibold">{t("admin.order.paymentAwaiting", { reference: order.number })}</p>
            <p>{t("admin.order.paymentDeadline", { time: payment.deadlineLabel, left: payment.timeLeft })}</p>
            <SendPaymentWhatsapp data={data} className="mt-2 justify-self-start" />
          </>
        ) : payment.paidLabel ? (
          <p className="font-semibold">{t("admin.order.paymentPaid", { amount, time: payment.paidLabel })}</p>
        ) : order.status === "pending_approval" ? (
          <p>{t("admin.order.paymentAfterApproval")}</p>
        ) : (
          <p>{payment.cancelledUnpaid ? t("admin.payment.cancelledUnpaid") : t("admin.order.paymentUnpaid")}</p>
        )}
        {order.status === "declined" && payment.declineReason && <p className="wrap-anywhere">{t("admin.order.declineReasonShown", { reason: payment.declineReason })}</p>}
        {payment.refund?.refundedLabel && <p className="font-semibold">{t("admin.order.refundedAt", { amount: formatRupees(payment.refund.amountRs), time: payment.refund.refundedLabel })}</p>}
      </div>
    </Section>
  );
}
