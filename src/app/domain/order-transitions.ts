// Order status transitions (FR-051; admin-orders spec "Transition table", juice-payment spec
// "Decisions"; PRD Appendix B is authoritative and `order-transitions.appendix-b.test.ts`
// compares the two). One table for admin and customer actions: the server derives every target
// from (status, fulfilment), never from input, and the admin screen's `allowed` is computed from
// the same rows. `domain/status` `transitionTarget` reads it too, for the Juice payment services.
// Paid/unpaid outside the Juice path and the private note are flags, not transitions.
import type { Fulfilment, OrderStatus } from "./status";

/** Customer email queued with a transition (notifications spec keys; content is E-10). */
export type TransitionEmail =
  | "order_confirmed"
  | "payment_instructions"
  | "order_declined"
  | "request_declined"
  | "quote"
  | "cancellation_confirmed"
  | "quote_closed"
  | "quote_accepted"
  | "ready_for_pickup"
  | "on_the_way"
  | "thank_you";

/** `order_event.type` written with the transition (data-model "order_event"). */
export type TransitionEvent =
  | "approved"
  | "payment_received"
  | "payment_undone"
  | "declined"
  | "quote_sent"
  | "status_advanced"
  | "status_reverted"
  | "cancelled"
  | "quote_accepted"
  | "quote_declined"
  | "quote_expired";

export interface TransitionRule {
  from: OrderStatus;
  /** Only for orders with this fulfilment; undefined = either. */
  fulfilment?: Fulfilment;
  to: OrderStatus;
  email: TransitionEmail | null;
  event: TransitionEvent;
}

export const ADMIN_ACTIONS = ["approve", "markPaid", "undoPaid", "decline", "declineRequest", "sendQuote", "advance", "revert", "cancel"] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

export const CUSTOMER_ACTIONS = ["acceptQuote", "declineQuote", "expireQuote", "cancel"] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

/** Not completed and not stopped: an admin may still cancel (owner Q6 adds quote_sent). Awaiting payment is refused instead (S-281). */
const CANCELLABLE: OrderStatus[] = [
  "pending_approval",
  "quote_needed",
  "quote_sent",
  "approved",
  "in_preparation",
  "ready_for_pickup",
  "out_for_delivery",
];

/** Refuse (S-281): before preparation is done; a paid order then owes its total back. */
const REFUSABLE: OrderStatus[] = ["awaiting_payment", "pending_approval", "approved", "in_preparation"];

const ADMIN_RULES: Record<AdminAction, TransitionRule[]> = {
  // Approve, then pay (Owner decision 2026-11-14, juice-payment spec): approving a website order
  // starts its Juice payment (the 12 h / 24 h clock counts from here, `awaiting_payment_since`)
  // and sends the payment instructions; Payment received then confirms it.
  approve: [{ from: "pending_approval", to: "awaiting_payment", email: "payment_instructions", event: "approved" }],
  // Juice payment (S-279): Payment received is the confirmation; its Undo exists only right
  // after it (the service also checks nothing happened since).
  markPaid: [{ from: "awaiting_payment", to: "approved", email: "order_confirmed", event: "payment_received" }],
  undoPaid: [{ from: "approved", to: "awaiting_payment", email: null, event: "payment_undone" }],
  decline: REFUSABLE.map((from) => ({ from, to: "declined", email: "order_declined", event: "declined" })),
  // A custom request waiting for its quote is declined with its own email (S-116 AC2); nothing was paid.
  declineRequest: [{ from: "quote_needed", to: "declined", email: "request_declined", event: "declined" }],
  // Re-quote while quote_sent overwrites the quote (FR-033).
  sendQuote: [
    { from: "quote_needed", to: "quote_sent", email: "quote", event: "quote_sent" },
    { from: "quote_sent", to: "quote_sent", email: "quote", event: "quote_sent" },
  ],
  advance: [
    { from: "approved", to: "in_preparation", email: null, event: "status_advanced" },
    { from: "in_preparation", fulfilment: "pickup", to: "ready_for_pickup", email: "ready_for_pickup", event: "status_advanced" },
    { from: "in_preparation", fulfilment: "delivery", to: "out_for_delivery", email: "on_the_way", event: "status_advanced" },
    { from: "ready_for_pickup", fulfilment: "pickup", to: "completed", email: "thank_you", event: "status_advanced" },
    { from: "out_for_delivery", fulfilment: "delivery", to: "completed", email: "thank_you", event: "status_advanced" },
  ],
  // Back one step sends no email; never from approved (owner Q12).
  revert: [
    { from: "in_preparation", to: "approved", email: null, event: "status_reverted" },
    { from: "ready_for_pickup", fulfilment: "pickup", to: "in_preparation", email: null, event: "status_reverted" },
    { from: "out_for_delivery", fulfilment: "delivery", to: "in_preparation", email: null, event: "status_reverted" },
    { from: "completed", fulfilment: "pickup", to: "ready_for_pickup", email: null, event: "status_reverted" },
    { from: "completed", fulfilment: "delivery", to: "out_for_delivery", email: null, event: "status_reverted" },
  ],
  cancel: CANCELLABLE.map((from) => ({ from, to: "cancelled", email: "cancellation_confirmed", event: "cancelled" })),
};

const CUSTOMER_RULES: Record<CustomerAction, TransitionRule[]> = {
  // E-08 (Juice payment hand-off): an accepted quote waits for its payment like a website order;
  // Payment received then approves it and sends order_confirmed.
  acceptQuote: [{ from: "quote_sent", to: "awaiting_payment", email: "quote_accepted", event: "quote_accepted" }],
  declineQuote: [{ from: "quote_sent", to: "closed", email: "quote_closed", event: "quote_declined" }],
  expireQuote: [{ from: "quote_sent", to: "closed", email: "quote_closed", event: "quote_expired" }],
  // Tracking page (S-096): before the order is paid or approved; `domain/status` adds "and unpaid".
  cancel: [
    { from: "awaiting_payment", to: "cancelled", email: "cancellation_confirmed", event: "cancelled" },
    { from: "pending_approval", to: "cancelled", email: "cancellation_confirmed", event: "cancelled" },
    { from: "quote_needed", to: "cancelled", email: "cancellation_confirmed", event: "cancelled" },
  ],
};

/** The rows of `action` (for one-statement SQL that picks the row by the order's status and fulfilment). */
export function adminRules(action: AdminAction): readonly TransitionRule[] {
  return ADMIN_RULES[action];
}

export function customerRules(action: CustomerAction): readonly TransitionRule[] {
  return CUSTOMER_RULES[action];
}

function match(rules: readonly TransitionRule[], from: OrderStatus, fulfilment?: Fulfilment): TransitionRule | null {
  return rules.find((rule) => rule.from === from && (!rule.fulfilment || !fulfilment || rule.fulfilment === fulfilment)) ?? null;
}

/** The admin rule for `action` on an order in `from`, or null when the table refuses it. */
export function transition(action: AdminAction, from: OrderStatus, fulfilment: Fulfilment): TransitionRule | null {
  return match(ADMIN_RULES[action], from, fulfilment);
}

/** The first admin rule of `action` from `from`, whatever the fulfilment. */
export function anyTransition(action: AdminAction, from: OrderStatus): TransitionRule | null {
  return match(ADMIN_RULES[action], from);
}

/** The customer-driven rule (tracking page, quote expiry job), or null. */
export function customerTransition(action: CustomerAction, from: OrderStatus): TransitionRule | null {
  return match(CUSTOMER_RULES[action], from);
}

const NOT_EDITABLE = new Set<OrderStatus>(["completed", "declined", "cancelled", "closed"]);

export interface AdminAllowed {
  approve: boolean;
  /** Payment received (Juice, S-279). */
  markPaid: boolean;
  /** Refunded: a refused or cancelled paid order whose refund is still to send (S-281). */
  markRefunded: boolean;
  /** Refuse an order (S-281). */
  decline: boolean;
  /** Decline a custom request waiting for its quote (S-116 AC2). */
  declineRequest: boolean;
  sendQuote: boolean;
  /** The status Next moves to, or null. */
  advance: OrderStatus | null;
  /** The status Back one step moves to, or null. */
  revert: OrderStatus | null;
  cancel: boolean;
  edit: boolean;
  setPaid: boolean;
  saveNote: boolean;
}

/**
 * `allowed` of the admin order screen (contracts.md `admin/order`): the UI offers only these, the
 * server re-checks. Mark paid/unpaid (a flag for orders paid outside Juice: cash, manual orders) is
 * not offered while an order awaits its Juice payment: Payment received is the way there.
 */
export function adminAllowed(status: OrderStatus, fulfilment: Fulfilment, refund: { refundPending: boolean } = { refundPending: false }): AdminAllowed {
  const can = (action: AdminAction) => transition(action, status, fulfilment) !== null;
  return {
    approve: can("approve"),
    markPaid: can("markPaid"),
    markRefunded: (status === "declined" || status === "cancelled") && refund.refundPending,
    decline: can("decline"),
    declineRequest: can("declineRequest"),
    sendQuote: can("sendQuote"),
    advance: transition("advance", status, fulfilment)?.to ?? null,
    revert: transition("revert", status, fulfilment)?.to ?? null,
    cancel: can("cancel"),
    edit: !NOT_EDITABLE.has(status),
    setPaid: status !== "awaiting_payment",
    saveNote: true,
  };
}
