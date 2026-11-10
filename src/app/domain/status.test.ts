import { describe, expect, test } from "vitest";
import { ACTIVE_STATUSES, CONFIRMED_STATUSES, ORDER_STATUSES, allowedActions, customerProgress, statusTone, transitionTarget } from "./status";

describe("status groups (contracts.md Conventions)", () => {
  test("active is every status except declined, cancelled and closed", () => {
    expect([...ACTIVE_STATUSES].sort()).toEqual(ORDER_STATUSES.filter((s) => !["declined", "cancelled", "closed"].includes(s)).sort());
  });

  test("confirmed is approved through completed", () => {
    expect([...CONFIRMED_STATUSES].sort()).toEqual(["approved", "completed", "in_preparation", "out_for_delivery", "ready_for_pickup"]);
  });
});

describe("customer progress (S-016 AC2, tracking spec)", () => {
  test("a pending delivery order is step 1 of 5 on the delivery path", () => {
    expect(customerProgress("pending_approval", "delivery")).toEqual({
      steps: ["pending_approval", "approved", "in_preparation", "out_for_delivery", "completed"],
      current: 0,
    });
  });

  test("the pickup path has Ready for pickup instead of Out for delivery", () => {
    expect(customerProgress("approved", "pickup")).toEqual({
      steps: ["pending_approval", "approved", "in_preparation", "ready_for_pickup", "completed"],
      current: 1,
    });
  });

  test.each([
    ["in_preparation", "delivery", 2],
    ["out_for_delivery", "delivery", 3],
    ["ready_for_pickup", "pickup", 3],
    ["completed", "pickup", 4],
  ] as const)("%s (%s) is step index %i", (status, fulfilment, current) => {
    expect(customerProgress(status, fulfilment)?.current).toBe(current);
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
  test("approve is allowed only from pending_approval, to approved", () => {
    for (const status of ORDER_STATUSES) {
      expect(transitionTarget("approve", status)).toBe(status === "pending_approval" ? "approved" : null);
    }
  });

  test("allowed actions for the order screen follow the table", () => {
    expect(allowedActions("pending_approval")).toEqual({ approve: true });
    expect(allowedActions("approved")).toEqual({ approve: false });
    expect(allowedActions("quote_needed")).toEqual({ approve: false });
  });
});
