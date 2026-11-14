// The Juice payment instructions as the token pages show them (contracts.md v0.40
// `PaymentView`, S-278): amount, reference, deadline in the page language, the account to pay
// (null = fallback "we'll send the details on WhatsApp") and the prefilled proof link.
import { type PaymentSettings, paymentDeadline, paymentDetails, proofHref } from "~/domain/payment";
import { formatClockTime, formatDayLabel, todayMU } from "~/domain/time";
import { t } from "~/i18n/catalog.server";
import { type Locale, formatRupees } from "~/lib/locale";

export interface PaymentView {
  totalRs: number;
  /** The order number: the Juice reference. */
  reference: string;
  /** Instant (ISO) after which an unpaid order is cancelled. */
  deadline: string;
  /** "Sat 14 Nov, 08:00" (Mauritius time). */
  deadlineLabel: string;
  details: { juiceName: string; juiceNumber: string } | null;
  /** "Send proof on WhatsApp"; null without the account details or a usable WhatsApp. */
  proofUrl: string | null;
}

/** "Sat 14 Nov, 08:00" (Mauritius time) for a pay-by instant: the token pages, emails and WhatsApp share it. */
export function deadlineLabel(deadline: Date, locale: Locale): string {
  return `${formatDayLabel(todayMU(deadline), locale)}, ${formatClockTime(deadline)}`;
}

/**
 * `createdAt` is when the payment clock started: the approval (`awaiting_payment_since`), or the
 * placement for an order that waited for payment from the start (before 2026-11-14).
 */
export function paymentView(input: { totalRs: number; reference: string; createdAt: Date; settings: PaymentSettings; locale: Locale }): PaymentView {
  const { totalRs, reference, createdAt, settings, locale } = input;
  const deadline = paymentDeadline(createdAt);
  const details = paymentDetails(settings);
  const proofText = t("order.payment.proofText", locale, { number: reference, amount: formatRupees(totalRs) });
  return {
    totalRs,
    reference,
    deadline: deadline.toISOString(),
    deadlineLabel: deadlineLabel(deadline, locale),
    details,
    proofUrl: details ? proofHref(settings.paymentWhatsapp, proofText) : null,
  };
}
