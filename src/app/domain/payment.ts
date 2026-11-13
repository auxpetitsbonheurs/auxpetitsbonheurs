// Full payment by MCB Juice at order (docs/specs/features/juice-payment.md, decision
// 2026-11-13). Pure: the deadline is computed from the order's `created_at`, never stored,
// and every rule takes "now" from the caller (request clock or the cron tick).
import { normalizePhone } from "./phone";

const HOUR_MS = 3_600_000;
/** A reminder is queued once the order has waited this long unpaid (S-280 AC1). */
export const PAYMENT_REMINDER_AFTER_MS = 12 * HOUR_MS;
/** An order still unpaid this long after placing is cancelled (S-280 AC2). */
export const PAYMENT_DEADLINE_MS = 24 * HOUR_MS;
/** Juice account name limit in Settings (S-277). */
export const JUICE_NAME_MAX = 60;
/** Refusal reason limit (S-281; contracts.md `decline` `{ reason?: ≤ 500 }`). */
export const DECLINE_REASON_MAX = 500;

export function paymentDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + PAYMENT_DEADLINE_MS);
}

/** What the hourly job owes an order awaiting payment at `now`. */
export function paymentDue(createdAt: Date, now: Date): "none" | "remind" | "cancel" {
  const waited = now.getTime() - createdAt.getTime();
  if (waited >= PAYMENT_DEADLINE_MS) return "cancel";
  return waited >= PAYMENT_REMINDER_AFTER_MS ? "remind" : "none";
}

export type TimeLeft = { kind: "hours"; value: number } | { kind: "minutes"; value: number } | { kind: "overdue" };

/** The admin badge: whole hours while ≥ 1 h is left, then minutes (at least 1), then overdue. */
export function timeLeft(createdAt: Date, now: Date): TimeLeft {
  const left = paymentDeadline(createdAt).getTime() - now.getTime();
  if (left <= 0) return { kind: "overdue" };
  if (left >= HOUR_MS) return { kind: "hours", value: Math.floor(left / HOUR_MS) };
  return { kind: "minutes", value: Math.max(1, Math.floor(left / 60_000)) };
}

export interface PaymentSettings {
  juiceName: string | null;
  juiceNumber: string | null;
  paymentWhatsapp: string | null;
}

const filled = (value: string | null | undefined) => (value && value.trim() !== "" ? value.trim() : null);

/** The account to pay, or null while the Owner has not entered both the name and the number (fallback). */
export function paymentDetails(settings: Pick<PaymentSettings, "juiceName" | "juiceNumber">): { juiceName: string; juiceNumber: string } | null {
  const juiceName = filled(settings.juiceName);
  const juiceNumber = filled(settings.juiceNumber);
  return juiceName && juiceNumber ? { juiceName, juiceNumber } : null;
}

/** True when admin must warn the Owner: a customer would get the fallback or no proof button. */
export function paymentDetailsMissing(settings: PaymentSettings): boolean {
  return paymentDetails(settings) === null || filled(settings.paymentWhatsapp) === null;
}

/** The "Send proof on WhatsApp" link, or null without a usable number. */
export function proofHref(whatsapp: string | null | undefined, text: string): string | null {
  const number = whatsapp ? normalizePhone(whatsapp) : null;
  return number ? `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(text)}` : null;
}
