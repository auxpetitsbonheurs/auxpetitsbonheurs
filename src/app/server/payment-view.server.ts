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

export function paymentView(input: { totalRs: number; reference: string; createdAt: Date; settings: PaymentSettings; locale: Locale }): PaymentView {
  const { totalRs, reference, createdAt, settings, locale } = input;
  const deadline = paymentDeadline(createdAt);
  const details = paymentDetails(settings);
  const proofText = t("order.payment.proofText", locale, { number: reference, amount: formatRupees(totalRs) });
  return {
    totalRs,
    reference,
    deadline: deadline.toISOString(),
    deadlineLabel: `${formatDayLabel(todayMU(deadline), locale)}, ${formatClockTime(deadline)}`,
    details,
    proofUrl: details ? proofHref(settings.paymentWhatsapp, proofText) : null,
  };
}
