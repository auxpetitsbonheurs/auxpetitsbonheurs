// Order statuses (PRD Appendix B) as the customer sees them: status groups (contracts.md
// Conventions), the progress path per fulfilment (checkout spec "Tracking page content")
// and the badge tone group (design-system "Status badge").

export const ORDER_STATUSES = [
  // A website order waits here until the client sees the Juice payment (juice-payment spec, 2026-11-13).
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

/**
 * Website orders since Juice payment start with Awaiting payment; an order still in Pending
 * approval (placed before 2026-11-13) keeps the approval step.
 */
function websitePath(fulfilment: Fulfilment, first: "awaiting_payment" | "pending_approval"): OrderStatus[] {
  const handover = fulfilment === "delivery" ? "out_for_delivery" : "ready_for_pickup";
  return [first, "approved", "in_preparation", handover, "completed"];
}

/**
 * The progress list for a website order, or null when the status is not on its path
 * (declined, cancelled, closed get an Alert; the quote path arrives with E-07).
 */
export function customerProgress(status: OrderStatus, fulfilment: Fulfilment): Progress | null {
  const steps = websitePath(fulfilment, status === "pending_approval" ? "pending_approval" : "awaiting_payment");
  const current = steps.indexOf(status);
  return current === -1 ? null : { steps, current };
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
 * Admin status actions (admin-orders "Transition table"; PRD Appendix B is authoritative).
 * Juice payment (2026-11-13): `markPaid` confirms a paid order, `undoPaid` reverses a mistaken
 * tap (the service also requires the order to be paid and unchanged since), `decline` refuses
 * an order before it is ready (a paid one then owes a refund). Quote, advance, revert and
 * cancel arrive with E-06.
 */
const ADMIN_TRANSITIONS = {
  approve: { from: ["pending_approval"], to: "approved" },
  markPaid: { from: ["awaiting_payment"], to: "approved" },
  undoPaid: { from: ["approved"], to: "awaiting_payment" },
  decline: { from: ["awaiting_payment", "pending_approval", "approved", "in_preparation"], to: "declined" },
} as const satisfies Record<string, { from: readonly OrderStatus[]; to: OrderStatus }>;

export type AdminAction = keyof typeof ADMIN_TRANSITIONS;

/** The status `action` moves an order in `from` to, or null when the table does not allow it. */
export function transitionTarget(action: AdminAction, from: OrderStatus): OrderStatus | null {
  const rule = ADMIN_TRANSITIONS[action];
  return (rule.from as readonly OrderStatus[]).includes(from) ? rule.to : null;
}

export interface AllowedActions {
  approve: boolean;
  markPaid: boolean;
  decline: boolean;
  /** "Refunded": a declined order whose refund has not been sent yet (S-281). */
  markRefunded: boolean;
}

/**
 * `allowed` of the admin order screen: the UI offers only these, the server re-checks. Undo
 * is offered only right after Payment received, so it is not listed here.
 */
export function allowedActions(status: OrderStatus, refund: { refundPending: boolean } = { refundPending: false }): AllowedActions {
  return {
    approve: transitionTarget("approve", status) !== null,
    markPaid: transitionTarget("markPaid", status) !== null,
    decline: transitionTarget("decline", status) !== null,
    markRefunded: status === "declined" && refund.refundPending,
  };
}
