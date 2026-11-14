import { describe, expect, test } from "vitest";
import { adminAllowed } from "./order-transitions";
import { ACTIVE_STATUSES, CONFIRMED_STATUSES, ORDER_STATUSES, allowedActions, canCustomerCancel, customerProgress, statusTone, transitionTarget } from "./status";

describe("status groups (contracts.md Conventions)", () => {
  test("active is every status except declined, cancelled and closed", () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(ORDER_STATUSES.filter((s) => !["declined", "cancelled", "closed"].includes(s)).sort());
  });

  test("confirmed is approved through completed", () => {
    expect([...CONFIRMED_STATUSES].sort()).toEqual(["approved", "completed", "in_preparation", "out_for_delivery", "ready_for_pickup"]);
  });
});

describe("customer progress (S-016 AC2, tracking spec)", () => {
  test("approve, then pay: a new website order is step 1 of 6, Pending approval then Awaiting payment", () => {
    expect(customerProgress("pending_approval", "delivery")).toEqual({
      steps: ["pending_approval", "awaiting_payment", "approved", "in_preparation", "out_for_delivery", "completed"],
      current: 0,
    });
  });

  test("once approved it waits for its payment: step 2 of 6 (an order placed straight into Awaiting payment shows the same)", () => {
    expect(customerProgress("awaiting_payment", "delivery")).toEqual({
      steps: ["pending_approval", "awaiting_payment", "approved", "in_preparation", "out_for_delivery", "completed"],
      current: 1,
    });
  });

  test("the pickup path has Ready for pickup instead of Out for delivery", () => {
    expect(customerProgress("approved", "pickup")).toEqual({
      steps: ["pending_approval", "awaiting_payment", "approved", "in_preparation", "ready_for_pickup", "completed"],
      current: 2,
    });
  });

  test.each([
    ["in_preparation", "delivery", 3],
    ["out_for_delivery", "delivery", 4],
    ["ready_for_pickup", "pickup", 4],
    ["completed", "pickup", 5],
  ] as const)("%s (%s) is step index %i", (status, fulfilment, current) => {
    expect(customerProgress(status, fulfilment)?.current).toBe(current);
  });

  test("a manual order (E-07, entered approved) keeps its 5-step list without the approval and payment steps' order changing", () => {
    expect(customerProgress("approved", "pickup", "manual")).toEqual({
      steps: ["awaiting_payment", "approved", "in_preparation", "ready_for_pickup", "completed"],
      current: 1,
    });
  });

  test.each(["declined", "cancelled", "closed", "quote_needed", "quote_sent"] as const)(
    "%s has no progress bar in this slice (alert or quote path come with E-06/E-07)",
    (status) => {
      expect(customerProgress(status, "delivery")).toBeNull();
    },
  );
});

describe("status tone (design-system Status badge)", () => {
  test.each([
    ["pending_approval", "action"],
    ["quote_needed", "action"],
    ["quote_sent", "waiting"],
    ["approved", "progress"],
    ["out_for_delivery", "progress"],
    ["completed", "done"],
    ["closed", "done"],
    ["declined", "stopped"],
    ["cancelled", "stopped"],
  ] as const)("%s is %s", (status, tone) => {
    expect(statusTone(status)).toBe(tone);
  });
});

describe("admin transitions (S-017 AC6; PRD Appendix B)", () => {
  test("approve is allowed only from pending_approval, to awaiting payment (approve, then pay)", () => {
    for (const status of ORDER_STATUSES) {
      expect(transitionTarget("approve", status)).toBe(status === "pending_approval" ? "awaiting_payment" : null);
    }
  });

  test("allowed actions for the order screen follow the table", () => {
    expect(allowedActions("pending_approval")).toEqual({ approve: true, markPaid: false, decline: true, markRefunded: false });
    expect(allowedActions("approved")).toEqual({ approve: false, markPaid: false, decline: true, markRefunded: false });
    expect(allowedActions("quote_needed")).toEqual({ approve: false, markPaid: false, decline: false, markRefunded: false });
  });
});

describe("Juice payment transitions (S-279, S-281)", () => {
  test("a new website order starts awaiting payment, before pending approval in the enum order", () => {
    expect(ORDER_STATUSES[0]).toBe("awaiting_payment");
    expect(ACTIVE_STATUSES.has("awaiting_payment")).toBe(true);
    expect(CONFIRMED_STATUSES.has("awaiting_payment")).toBe(false);
  });

  test("markPaid moves awaiting_payment to approved and nothing else", () => {
    for (const status of ORDER_STATUSES) {
      expect(transitionTarget("markPaid", status)).toBe(status === "awaiting_payment" ? "approved" : null);
    }
  });

  test("undoPaid moves approved back to awaiting_payment only", () => {
    for (const status of ORDER_STATUSES) {
      expect(transitionTarget("undoPaid", status)).toBe(status === "approved" ? "awaiting_payment" : null);
    }
  });

  test("decline is allowed before preparation is done: awaiting payment, pending, approved, in preparation", () => {
    const allowed = ORDER_STATUSES.filter((s) => transitionTarget("decline", s) !== null);
    expect(allowed).toEqual(["awaiting_payment", "pending_approval", "approved", "in_preparation"]);
    expect(transitionTarget("decline", "approved")).toBe("declined");
  });

  test("the order screen offers Payment received and Refuse while awaiting payment", () => {
    expect(allowedActions("awaiting_payment")).toEqual({ approve: false, markPaid: true, decline: true, markRefunded: false });
  });

  test("Refunded is offered only for a declined order with a refund still to send", () => {
    expect(allowedActions("declined", { refundPending: true }).markRefunded).toBe(true);
    expect(allowedActions("declined", { refundPending: false }).markRefunded).toBe(false);
    expect(allowedActions("declined").decline).toBe(false);
  });

  test("awaiting payment is an action status for the badge", () => {
    expect(statusTone("awaiting_payment")).toBe("action");
  });
});

describe("quote path (S-095 AC1)", () => {
  test("a custom request starts at Quote needed, then Quote sent, then the fulfilment path", () => {
    expect(customerProgress("quote_sent", "pickup", "custom_request")).toEqual({
      steps: ["quote_needed", "quote_sent", "awaiting_payment", "approved", "in_preparation", "ready_for_pickup", "completed"],
      current: 1,
    });
    // E-08: an accepted quote waits for its Juice payment like a website order.
    expect(customerProgress("awaiting_payment", "pickup", "custom_request")?.current).toBe(2);
    expect(customerProgress("out_for_delivery", "delivery", "custom_request")?.current).toBe(5);
  });

  test("E-08: Send quote is offered in Quote needed and Quote sent; Decline request only in Quote needed", () => {
    expect(adminAllowed("quote_needed", "pickup")).toMatchObject({ sendQuote: true, declineRequest: true });
    expect(adminAllowed("quote_sent", "pickup")).toMatchObject({ sendQuote: true, declineRequest: false });
    for (const status of ["approved", "declined", "closed", "cancelled", "awaiting_payment"] as const) expect(adminAllowed(status, "pickup").sendQuote).toBe(false);
  });

  test("a website order never shows the quote steps", () => {
    expect(customerProgress("quote_needed", "delivery", "website")).toBeNull();
  });
});

describe("customer cancel (S-096 AC1-AC3, FR-027)", () => {
  test.each(ORDER_STATUSES.map((s) => [s] as const))("%s: only awaiting payment, pending approval and quote needed may be cancelled, and only while unpaid", (status) => {
    const expected = status === "awaiting_payment" || status === "pending_approval" || status === "quote_needed";
    expect(canCustomerCancel({ status, paid: false })).toBe(expected);
    // A paid order needs the bakery's refund step (Juice payment work), never the Cancel button.
    expect(canCustomerCancel({ status, paid: true })).toBe(false);
  });
});
