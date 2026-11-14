// S-115: the transition table (admin-orders spec "Transition table"; PRD Appendix B is
// authoritative). Every (status, fulfilment, action) pair is generated: the table accepts
// exactly the listed ones.
import { describe, expect, test } from "vitest";
import {
  ADMIN_ACTIONS,
  type AdminAction,
  CUSTOMER_ACTIONS,
  adminAllowed,
  customerTransition,
  transition,
} from "./order-transitions";
import { type Fulfilment, ORDER_STATUSES, type OrderStatus } from "./status";

const FULFILMENTS: Fulfilment[] = ["pickup", "delivery"];
const ACTIVE_BEFORE_COMPLETED: OrderStatus[] = [
  "pending_approval",
  "quote_needed",
  "quote_sent",
  "approved",
  "in_preparation",
  "ready_for_pickup",
  "out_for_delivery",
];

/** The spec table written out by hand, independent of the module's own rows. */
function expected(action: AdminAction, from: OrderStatus, fulfilment: Fulfilment): OrderStatus | null {
  const handover = fulfilment === "pickup" ? "ready_for_pickup" : "out_for_delivery";
  switch (action) {
    case "approve":
      return from === "pending_approval" ? "awaiting_payment" : null; // approve, then pay (2026-11-14)
    case "markPaid":
      return from === "awaiting_payment" ? "approved" : null;
    case "undoPaid":
      return from === "approved" ? "awaiting_payment" : null;
    case "decline":
      return ["awaiting_payment", "pending_approval", "approved", "in_preparation"].includes(from) ? "declined" : null;
    case "declineRequest":
      return from === "quote_needed" ? "declined" : null;
    case "sendQuote":
      return from === "quote_needed" || from === "quote_sent" ? "quote_sent" : null;
    case "advance":
      if (from === "approved") return "in_preparation";
      if (from === "in_preparation") return handover;
      return from === handover ? "completed" : null;
    case "revert":
      if (from === "in_preparation") return "approved";
      if (from === handover) return "in_preparation";
      return from === "completed" ? handover : null;
    case "cancel":
      return ACTIVE_BEFORE_COMPLETED.includes(from) ? "cancelled" : null;
  }
}

describe("admin transitions (S-115 AC1)", () => {
  const pairs = ADMIN_ACTIONS.flatMap((action) => ORDER_STATUSES.flatMap((from) => FULFILMENTS.map((f) => [action, from, f] as const)));

  test.each(pairs)("%s from %s (%s) follows the table", (action, from, fulfilment) => {
    expect(transition(action, from, fulfilment)?.to ?? null).toBe(expected(action, from, fulfilment));
  });
});

describe("examples (S-115 AC2, AC3, AC4)", () => {
  test("completed cannot be cancelled; pending_approval cannot be advanced", () => {
    expect(transition("cancel", "completed", "pickup")).toBeNull();
    expect(transition("advance", "pending_approval", "delivery")).toBeNull();
  });

  test("advance from in_preparation depends on fulfilment, then ends at completed", () => {
    expect(transition("advance", "in_preparation", "pickup")?.to).toBe("ready_for_pickup");
    expect(transition("advance", "in_preparation", "delivery")?.to).toBe("out_for_delivery");
    expect(transition("advance", "ready_for_pickup", "pickup")?.to).toBe("completed");
    expect(transition("advance", "out_for_delivery", "delivery")?.to).toBe("completed");
  });

  test("a pickup order can never reach out_for_delivery (and the reverse)", () => {
    expect(transition("advance", "out_for_delivery", "pickup")).toBeNull();
    expect(transition("revert", "ready_for_pickup", "delivery")).toBeNull();
  });

  test("revert is one step back; never from approved (owner Q12)", () => {
    expect(transition("revert", "in_preparation", "pickup")?.to).toBe("approved");
    expect(transition("revert", "completed", "pickup")?.to).toBe("ready_for_pickup");
    expect(transition("revert", "completed", "delivery")?.to).toBe("out_for_delivery");
    expect(transition("revert", "approved", "pickup")).toBeNull();
  });
});

describe("emails and events (admin-orders spec, notifications spec)", () => {
  test.each([
    ["approve", "pending_approval", "pickup", "payment_instructions", "approved"],
    ["decline", "pending_approval", "pickup", "order_declined", "declined"],
    ["decline", "approved", "pickup", "order_declined", "declined"],
    ["markPaid", "awaiting_payment", "pickup", "order_confirmed", "payment_received"],
    ["undoPaid", "approved", "pickup", null, "payment_undone"],
    ["advance", "approved", "pickup", null, "status_advanced"],
    ["advance", "in_preparation", "pickup", "ready_for_pickup", "status_advanced"],
    ["advance", "in_preparation", "delivery", "on_the_way", "status_advanced"],
    ["advance", "ready_for_pickup", "pickup", "thank_you", "status_advanced"],
    ["revert", "completed", "delivery", null, "status_reverted"],
    ["cancel", "quote_sent", "pickup", "cancellation_confirmed", "cancelled"],
  ] as const)("%s from %s (%s) queues %s and logs %s", (action, from, fulfilment, email, event) => {
    expect(transition(action, from, fulfilment)).toMatchObject({ email, event });
  });
});

describe("allowed (S-115 AC5, AC6)", () => {
  test("pending pickup order: approve, decline, cancel, edit; no advance or revert", () => {
    expect(adminAllowed("pending_approval", "pickup")).toEqual({
      approve: true,
      markPaid: false,
      markRefunded: false,
      decline: true,
      declineRequest: false,
      sendQuote: false,
      advance: null,
      revert: null,
      cancel: true,
      edit: true,
      setPaid: true,
      saveNote: true,
    });
  });

  test("advance and revert name the target status", () => {
    expect(adminAllowed("in_preparation", "delivery")).toMatchObject({ advance: "out_for_delivery", revert: "approved" });
    expect(adminAllowed("completed", "pickup")).toMatchObject({ advance: null, revert: "ready_for_pickup", cancel: false, edit: false });
  });

  test.each(ORDER_STATUSES)("cancel is offered from %s exactly per the spec list", (status) => {
    expect(adminAllowed(status, "pickup").cancel).toBe(ACTIVE_BEFORE_COMPLETED.includes(status));
  });

  test.each(ORDER_STATUSES.filter((s) => s !== "awaiting_payment"))("setPaid and saveNote are flags at any status (%s), never transitions", (status) => {
    expect(adminAllowed(status, "delivery")).toMatchObject({ setPaid: true, saveNote: true });
  });

  test("awaiting a Juice payment: Payment received and Refuse, no paid flag or cancel (juice-payment spec)", () => {
    expect(adminAllowed("awaiting_payment", "pickup")).toMatchObject({ markPaid: true, decline: true, setPaid: false, cancel: false, approve: false });
  });

  test("Refunded is offered for a refused or cancelled order with a refund still to send", () => {
    expect(adminAllowed("declined", "pickup", { refundPending: true }).markRefunded).toBe(true);
    expect(adminAllowed("cancelled", "pickup", { refundPending: true }).markRefunded).toBe(true);
    expect(adminAllowed("cancelled", "pickup", { refundPending: false }).markRefunded).toBe(false);
    expect(adminAllowed("approved", "pickup", { refundPending: true }).markRefunded).toBe(false);
  });

  test.each(["declined", "cancelled", "closed", "completed"] as const)("edit is refused once %s", (status) => {
    expect(adminAllowed(status, "pickup").edit).toBe(false);
  });
});

describe("customer transitions from the same module (S-115 AC7)", () => {
  test("quote accept, decline and expiry; customer cancel only while waiting", () => {
    // E-08: an accepted quote enters the Juice payment flow (Payment received approves it).
    expect(customerTransition("acceptQuote", "quote_sent")).toMatchObject({ to: "awaiting_payment", email: "quote_accepted" });
    expect(customerTransition("declineQuote", "quote_sent")?.to).toBe("closed");
    expect(customerTransition("expireQuote", "quote_sent")?.to).toBe("closed");
    expect(customerTransition("cancel", "awaiting_payment")?.to).toBe("cancelled");
    expect(customerTransition("cancel", "pending_approval")?.to).toBe("cancelled");
    expect(customerTransition("cancel", "quote_needed")?.to).toBe("cancelled");
    expect(customerTransition("cancel", "approved")).toBeNull();
    // A withdrawn (admin-cancelled) quote can no longer be accepted (S-119 AC3).
    expect(customerTransition("acceptQuote", "cancelled")).toBeNull();
    expect(CUSTOMER_ACTIONS).toEqual(["acceptQuote", "declineQuote", "expireQuote", "cancel"]);
  });
});
