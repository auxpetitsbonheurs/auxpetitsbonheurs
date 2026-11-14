import { FileText, MessageCircle } from "lucide-react";
import { useState } from "react";
import { Button, buttonVariants } from "~/components/ui/button";
import { useI18n } from "~/i18n/react";
import { formatRupees } from "~/lib/locale";
import type { OrderLoaderData } from "~/routes/admin/order";
import { InvoiceDialog, preloadInvoicePdf } from "./invoice-dialog";
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

/**
 * Download invoice beside the Payment heading (tidy job): reachable in every state, also while the
 * action bar shows the refund step instead of More actions. Same dialog as More actions (S-127).
 * In the heading row it adds no height, so the contact buttons below never move under the
 * phone's sticky action bar. Visible "Invoice", named "Download invoice" (the label is in the name).
 */
function InvoiceButton({ orderId }: { orderId: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="lg"
        className="-my-1 h-auto min-h-11 shrink-0 px-3"
        aria-label={t("admin.invoice.download")}
        onPointerEnter={() => void preloadInvoicePdf()}
        onFocus={() => void preloadInvoicePdf()}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <FileText aria-hidden="true" />
        {t("admin.invoice.short")}
      </Button>
      <InvoiceDialog orderId={orderId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Juice payment state (S-279, S-281): pending approval, awaiting with the deadline, paid, refund due or sent. */
export function PaymentSection({ data }: { data: OrderLoaderData }) {
  const { order, payment } = data;
  const { t } = useI18n();
  const amount = formatRupees(order.totalRs);
  return (
    <Section id="payment-heading" title={t("admin.order.paymentTitle")} action={<InvoiceButton orderId={order.id} />}>
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
