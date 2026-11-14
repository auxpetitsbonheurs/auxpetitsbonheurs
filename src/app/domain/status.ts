// Order statuses (PRD Appendix B) as the customer sees them: status groups (contracts.md
// Conventions), the progress path per fulfilment (checkout spec "Tracking page content")
// and the badge tone group (design-system "Status badge").

import { anyTransition, customerRules } from "./order-transitions";

export const ORDER_STATUSES = [
  // Approve, then pay (2026-11-14): a website order waits for approval, then for its Juice payment.
  // (The enum order is the database's: awaiting_payment was added first in 0013.)
  "awaiting_payment",
  "pending_approval",
  "quote_needed",
  "quote_sent",
  "approved",
  "in_preparation",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
  "declined",
  "cancelled",
  "closed",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Fulfilment = "delivery" | "pickup";

const STOPPED = new Set<OrderStatus>(["declined", "cancelled", "closed"]);

/** Calendar counts, lists, Today. */
export const ACTIVE_STATUSES: ReadonlySet<OrderStatus> = new Set(ORDER_STATUSES.filter((s) => !STOPPED.has(s)));

/** Prep list, evening reminder count, unpaid list. */
export const CONFIRMED_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "approved",
  "in_preparation",
  "ready_for_pickup",
  "out_for_delivery",
  "completed",
]);

export interface Progress {
  steps: OrderStatus[];
  /** Index of the current step in `steps`. */
  current: number;
}

/** From the Juice payment on: Awaiting payment, Approved (paid), preparation, handover, completed. */
function paidPath(fulfilment: Fulfilment): OrderStatus[] {
  const handover = fulfilment === "delivery" ? "out_for_delivery" : "ready_for_pickup";
  return ["awaiting_payment", "approved", "in_preparation", handover, "completed"];
}

/**
 * Approve, then pay (2026-11-14): a website order waits for the bakery's approval, then for its
 * Juice payment. An order placed between 2026-11-13 and the change (straight to Awaiting payment)
 * shows the same list with the approval step done.
 */
function websitePath(fulfilment: Fulfilment): OrderStatus[] {
  return ["pending_approval", ...paidPath(fulfilment)];
}

export type OrderSource = "website" | "custom_request" | "manual";

/** A custom request starts with its quote: Quote needed, Quote sent, then the fulfilment path (S-095 AC1). */
function quotePath(fulfilment: Fulfilment): OrderStatus[] {
  // E-08: accepting the quote is the approval; it is then paid by Juice like a website order.
  return ["quote_needed", "quote_sent", ...paidPath(fulfilment)];
}

/**
 * The progress list for an order, or null when the status is not on its path (declined,
 * cancelled, closed get an Alert instead, S-095 AC2).
 */
export function customerProgress(status: OrderStatus, fulfilment: Fulfilment, source: OrderSource = "website"): Progress | null {
  // A manual order (E-07) is entered approved and keeps its earlier list.
  const steps = source === "custom_request" ? quotePath(fulfilment) : source === "manual" ? paidPath(fulfilment) : websitePath(fulfilment);
  const current = steps.indexOf(status);
  return current === -1 ? null : { steps, current };
}

/**
 * Statuses a customer may cancel from the tracking page (FR-027; checkout spec "Tracking
 * actions"). A website order is cancellable while it waits for approval and while it waits for
 * its Juice payment (unpaid), approve-then-pay 2026-11-14 (S-096 note).
 */
export const CUSTOMER_CANCELLABLE: ReadonlySet<OrderStatus> = new Set<OrderStatus>(customerRules("cancel").map((rule) => rule.from));

/**
 * `canCancel` of the tracking page (S-096). A paid order is never cancelled by the button:
 * the money goes back through the bakery's refund step (Juice payment, S-281), so the page
 * shows the WhatsApp guidance instead.
 */
export function canCustomerCancel(order: { status: OrderStatus; paid: boolean }): boolean {
  return CUSTOMER_CANCELLABLE.has(order.status) && !order.paid;
}

export type StatusTone = "action" | "waiting" | "progress" | "done" | "stopped";

/** Colour group of the status badge; the badge always shows the word as well. */
export function statusTone(status: OrderStatus): StatusTone {
  if (status === "awaiting_payment" || status === "pending_approval" || status === "quote_needed") return "action";
  if (status === "quote_sent") return "waiting";
  if (status === "completed" || status === "closed") return "done";
  if (status === "declined" || status === "cancelled") return "stopped";
  return "progress";
}

/**
 * Admin status actions: the table lives in `order-transitions.ts` (S-115: one table for every
 * action, compared with PRD Appendix B). These two keep the payment services' API.
 */
export type AdminAction = "approve" | "markPaid" | "undoPaid" | "decline";

/** The status `action` moves an order in `from` to, or null when the table does not allow it. */
export function transitionTarget(action: AdminAction, from: OrderStatus): OrderStatus | null {
  return anyTransition(action, from)?.to ?? null;
}

export interface AllowedActions {
  approve: boolean;
  markPaid: boolean;
  decline: boolean;
  /** "Refunded": a declined order whose refund has not been sent yet (S-281). */
  markRefunded: boolean;
}

/**
 * The Juice payment part of `allowed` (the admin screen uses `adminAllowed`, a superset). Undo is
 * offered only right after Payment received, so it is not listed here.
 */
export function allowedActions(status: OrderStatus, refund: { refundPending: boolean } = { refundPending: false }): AllowedActions {
  return {
    approve: transitionTarget("approve", status) !== null,
    markPaid: transitionTarget("markPaid", status) !== null,
    decline: transitionTarget("decline", status) !== null,
    markRefunded: status === "declined" && refund.refundPending,
  };
}
