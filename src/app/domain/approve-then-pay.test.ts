// Approve, then pay (Owner decision 2026-11-14): the stages and the payment clock, with fixed
// instants (never the system clock).
import { describe, expect, test } from "vitest";
import { APPROVE_THEN_PAY_STEPS, paymentDueAt, paymentStage, paymentTimers } from "./approve-then-pay";
import { adminRules, customerRules } from "./order-transitions";

const placed = new Date("2026-11-20T06:00:00Z");
const approved = new Date("2026-11-20T15:30:00Z");
const at = (iso: string) => new Date(iso);

describe("stages", () => {
  test.each([
    ["pending_approval", "awaiting_approval"],
    ["awaiting_payment", "awaiting_payment"],
    ["approved", "none"],
    ["quote_sent", "none"],
    ["cancelled", "none"],
  ] as const)("%s → %s", (status, stage) => {
    expect(paymentStage(status)).toBe(stage);
  });

  test("the flow's steps are the transition table's: approve leads to awaiting payment, Payment received to approved", () => {
    expect(APPROVE_THEN_PAY_STEPS).toEqual(["pending_approval", "awaiting_payment", "approved"]);
    expect(adminRules("approve").map((r) => [r.from, r.to, r.email])).toEqual([["pending_approval", "awaiting_payment", "payment_instructions"]]);
    expect(adminRules("markPaid").map((r) => [r.from, r.to, r.email])).toEqual([["awaiting_payment", "approved", "order_confirmed"]]);
  });

  test("the customer may cancel while pending approval and while awaiting payment", () => {
    const from = customerRules("cancel").map((r) => r.from);
    expect(from).toContain("pending_approval");
    expect(from).toContain("awaiting_payment");
  });
});

describe("the payment clock counts from the approval", () => {
  test("reminder 12 h and cancel 24 h after approval, not after placing", () => {
    expect(paymentTimers(approved, placed)).toEqual({ since: approved, remindAt: at("2026-11-21T03:30:00Z"), cancelAt: at("2026-11-21T15:30:00Z") });
  });

  test("a row without an approval instant (placed straight into Awaiting payment) counts from its placement", () => {
    expect(paymentTimers(null, placed).cancelAt).toEqual(at("2026-11-21T06:00:00Z"));
  });

  test.each([
    // 24 h after placing but only 14.5 h after approval: a reminder, not a cancel.
    ["2026-11-21T06:00:00Z", "remind"],
    ["2026-11-21T03:29:59Z", "none"],
    ["2026-11-21T03:30:00Z", "remind"],
    ["2026-11-21T15:29:59Z", "remind"],
    ["2026-11-21T15:30:00Z", "cancel"],
  ] as const)("at %s the job owes %s", (now, due) => {
    expect(paymentDueAt(approved, placed, at(now))).toBe(due);
  });
});
