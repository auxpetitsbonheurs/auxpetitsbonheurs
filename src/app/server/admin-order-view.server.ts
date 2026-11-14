// The admin order screen's view model (contracts.md `admin/order`): localised activity-log lines
// (S-125), contact links (S-113 AC2-AC4) and the decline/cancel reason (S-113 AC1). Text from
// customers and admins is passed as values and rendered by React, so it is always escaped.
import { paymentDeadline, timeLeft } from "~/domain/payment";
import { formatLogTime } from "~/domain/time";
import { t as translate } from "~/i18n/catalog.server";
import { type Locale, formatRupees } from "~/lib/locale";
import type { OrderEventView } from "~/server/repos/order-events.server";

const KNOWN_EVENTS = new Set([
  "created",
  "approved",
  "declined",
  "cancelled",
  "quote_sent",
  "quote_accepted",
  "quote_declined",
  "quote_expired",
  "status_advanced",
  "status_reverted",
  "marked_paid",
  "marked_unpaid",
  "edited",
  "email_failed",
  "pending_alert_sent",
  // Juice payment (S-279..S-281).
  "payment_received",
  "payment_undone",
  "payment_reminder_sent",
  "refunded",
]);

export interface EventLine {
  at: string;
  type: string;
  text: string;
  /** Extra lines under the entry: reason, refund note, total change. */
  notes: string[];
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const rupees = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

function eventNotes(event: OrderEventView, locale: Locale): string[] {
  const details = event.details ?? {};
  const notes: string[] = [];
  const reason = text(details.reason);
  if (reason) notes.push(translate("admin.log.reason", locale, { reason }));
  if (event.type === "cancelled" && details.paid === true) notes.push(translate("admin.log.paidRefund", locale));
  const from = rupees(details.oldTotalRs);
  const to = rupees(details.newTotalRs);
  if (from !== null && to !== null && from !== to) notes.push(translate("admin.log.total", locale, { from: formatRupees(from), to: formatRupees(to) }));
  return notes;
}

/** "Approved by Sarah, 12 Nov 14:05" in the admin's language, Mauritius time (FR-045). Unknown types read "Changed by". */
export function eventLine(event: OrderEventView, locale: Locale): EventLine {
  const actor = event.actor.name ?? translate(`admin.log.actor.${event.actor.type}`, locale);
  const key = KNOWN_EVENTS.has(event.type) ? event.type : "other";
  const status = event.toStatus ? translate(`admin.status.${event.toStatus}`, locale) : "";
  return {
    at: event.at,
    type: event.type,
    text: translate(`admin.log.event.${key}`, locale, { actor, status, time: formatLogTime(new Date(event.at), locale) }),
    notes: eventNotes(event, locale),
  };
}

/** The reason an admin gave when cancelling (latest cancellation); a refusal's reason is in the Payment section. */
export function cancelReason(status: string, events: OrderEventView[]): string | null {
  if (status !== "cancelled") return null;
  const cancelled = [...events].reverse().find((event) => event.type === "cancelled");
  return text(cancelled?.details?.reason) ?? null;
}

/** "12 h left" / "45 min left" / "Cancelling soon" (juice-payment spec). */
function timeLeftText(createdAt: Date, now: Date, locale: Locale): string {
  const left = timeLeft(createdAt, now);
  if (left.kind === "overdue") return translate("admin.orders.payment.overdue", locale);
  return translate(left.kind === "hours" ? "admin.orders.payment.hoursLeft" : "admin.orders.payment.minutesLeft", locale, { count: left.value });
}

interface PaymentFactsSource {
  status: string;
  /** Start of the Juice payment clock: creation, or an accepted quote's acceptance (E-08). */
  paymentFrom: Date;
  paid: boolean;
  paidAt: Date | null;
  refundDueRs: number | null;
  refundedAt: Date | null;
  cancelReason: string | null;
  declineReason: string | null;
}

/** The Payment section's facts (S-279, S-281; moved here from the route by E-06), in the admin's language. */
export function paymentFacts(order: PaymentFactsSource, now: Date, locale: Locale) {
  return {
    awaiting: order.status === "awaiting_payment",
    deadlineLabel: formatLogTime(paymentDeadline(order.paymentFrom), locale),
    timeLeft: timeLeftText(order.paymentFrom, now, locale),
    paidLabel: order.paid && order.paidAt ? formatLogTime(order.paidAt, locale) : null,
    refund: order.refundDueRs === null ? null : { amountRs: order.refundDueRs, refundedLabel: order.refundedAt ? formatLogTime(order.refundedAt, locale) : null },
    cancelledUnpaid: order.status === "cancelled" && order.cancelReason === "unpaid",
    declineReason: order.declineReason,
  };
}

const E164 = /^\+\d{8,15}$/;

export interface ContactLinks {
  telUrl: string | null;
  whatsappUrl: string | null;
  mapsUrl: string | null;
}

/**
 * Call is `tel:` with the stored E.164 number; WhatsApp opens `wa.me` with the order number in
 * the customer's language (FR-050; template picker is E-10); Maps searches the address. A link
 * is null when its data is missing or unusable (legacy rows), and the view disables it.
 */
export function contactLinks(order: { contactPhone: string; contactName: string; number: string; locale: Locale; fulfilment: string; address: string | null }): ContactLinks {
  const phone = order.contactPhone.replace(/[\s-]/g, "");
  const usable = E164.test(phone);
  const message = translate("admin.order.whatsappText", order.locale, { name: order.contactName, number: order.number });
  const address = order.address?.trim();
  return {
    telUrl: usable ? `tel:${phone}` : null,
    whatsappUrl: usable ? `https://wa.me/${phone.slice(1)}?text=${encodeURIComponent(message)}` : null,
    mapsUrl: order.fulfilment === "delivery" && address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : null,
  };
}
