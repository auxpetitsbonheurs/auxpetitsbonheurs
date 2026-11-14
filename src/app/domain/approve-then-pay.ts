// Approve, then pay (Owner decision 2026-11-14; juice-payment spec "Decisions"): the reusable
// shape of a booking the bakery approves before the customer pays by Juice. Website orders use
// it today; workshop registrations reuse it (register → approve → pay). Pure: no database, and
// every rule takes "now" from the caller (request clock or the cron tick).
//
//   pending_approval ──approve──▶ awaiting_payment ──payment received──▶ approved (paid)
//          │  refuse / cancel           │  refuse / cancel / unpaid 24 h after approval
//          ▼                            ▼
//       declined / cancelled         declined / cancelled
//
// The payment clock starts at approval (`awaiting_payment_since`), never at placement: the
// reminder is due 12 h after it and the unpaid cancel 24 h after it (`domain/payment`).
import { PAYMENT_DEADLINE_MS, PAYMENT_REMINDER_AFTER_MS, paymentDeadline, paymentDue } from "./payment";

/** The statuses of the flow, in order; any other status is outside it ("done" or "stopped"). */
export const APPROVE_THEN_PAY_STEPS = ["pending_approval", "awaiting_payment", "approved"] as const;
export type ApproveThenPayStep = (typeof APPROVE_THEN_PAY_STEPS)[number];

/** What the customer is waiting for, for the confirmation and tracking copy. */
export type PaymentStage =
  /** The bakery has not approved yet: no payment details are shown. */
  | "awaiting_approval"
  /** Approved: show the payment guide (Juice details, copy buttons, proof button, deadline). */
  | "awaiting_payment"
  /** Paid and confirmed, or outside the flow. */
  | "none";

export function paymentStage(status: string): PaymentStage {
  if (status === "pending_approval") return "awaiting_approval";
  if (status === "awaiting_payment") return "awaiting_payment";
  return "none";
}

export interface PaymentTimers {
  /** When the clock started: the approval (or, for a legacy row without it, the placement). */
  since: Date;
  /** The one reminder is due from here. */
  remindAt: Date;
  /** Unpaid from here: the hourly job cancels it and frees the date. */
  cancelAt: Date;
}

/**
 * The clock of a booking awaiting payment. `awaitingSince` is the approval instant; a row
 * from before 2026-11-14 that has none falls back to its placement (`createdAt`), as the
 * hourly job's `coalesce(awaiting_payment_since, created_at)` does.
 */
export function paymentTimers(awaitingSince: Date | null, createdAt: Date): PaymentTimers {
  const since = awaitingSince ?? createdAt;
  return { since, remindAt: new Date(since.getTime() + PAYMENT_REMINDER_AFTER_MS), cancelAt: paymentDeadline(since) };
}

/** What the hourly job owes a booking awaiting payment at `now` (none, remind or cancel). */
export function paymentDueAt(awaitingSince: Date | null, createdAt: Date, now: Date): ReturnType<typeof paymentDue> {
  return paymentDue(awaitingSince ?? createdAt, now);
}

export { PAYMENT_DEADLINE_MS, PAYMENT_REMINDER_AFTER_MS };
