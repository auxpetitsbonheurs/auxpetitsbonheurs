// S-320: the order discount rules (amount or percentage of the goods, when it can change, rebasing).
import { describe, expect, test } from "vitest";
import { canEditDiscount, goodsOf, lineAfterDiscount, percentOf, rebaseDiscount, resolveDiscount, storedDiscount, subtotalOf } from "./order-discount";

describe("resolveDiscount (S-320 AC2, AC3)", () => {
  test("a fixed amount from Rs 1 up to the goods", () => {
    expect(resolveDiscount({ kind: "amount", value: 200, reason: " Loyal customer " }, 1200)).toEqual({ ok: true, discount: { discountRs: 200, percent: null, reason: "Loyal customer" } });
    expect(resolveDiscount({ kind: "amount", value: 1200 }, 1200)).toEqual({ ok: true, discount: { discountRs: 1200, percent: null, reason: null } });
    expect(resolveDiscount({ kind: "amount", value: 1201 }, 1200)).toEqual({ ok: false, field: "value", maxRs: 1200 });
    expect(resolveDiscount({ kind: "amount", value: 0 }, 1200)).toMatchObject({ ok: false, field: "value" });
    expect(resolveDiscount({ kind: "amount", value: 2.5 }, 1200)).toMatchObject({ ok: false, field: "value" });
  });

  test("a percentage of the goods, rounded half up to whole rupees", () => {
    expect(resolveDiscount({ kind: "percent", value: 10 }, 1205)).toEqual({ ok: true, discount: { discountRs: 121, percent: 10, reason: null } });
    expect(resolveDiscount({ kind: "percent", value: 100 }, 900)).toEqual({ ok: true, discount: { discountRs: 900, percent: 100, reason: null } });
    expect(resolveDiscount({ kind: "percent", value: 101 }, 900)).toMatchObject({ ok: false, field: "value" });
    expect(resolveDiscount({ kind: "percent", value: 0 }, 900)).toMatchObject({ ok: false, field: "value" });
  });

  test("a percentage that comes to Rs 0 (no goods yet) is refused", () => {
    expect(resolveDiscount({ kind: "percent", value: 10 }, 0)).toMatchObject({ ok: false, field: "value" });
    expect(resolveDiscount({ kind: "percent", value: 1 }, 40)).toMatchObject({ ok: false, field: "value" });
  });

  test("the reason is at most 80 characters; blank means none", () => {
    expect(resolveDiscount({ kind: "amount", value: 10, reason: "x".repeat(80) }, 100)).toMatchObject({ ok: true });
    expect(resolveDiscount({ kind: "amount", value: 10, reason: "x".repeat(81) }, 100)).toMatchObject({ ok: false, field: "reason" });
    expect(resolveDiscount({ kind: "amount", value: 10, reason: "   " }, 100)).toMatchObject({ ok: true, discount: { reason: null } });
  });
});

describe("totals (S-320)", () => {
  test("the subtotal is the total plus the discount; the goods leave the delivery fee out", () => {
    expect(subtotalOf({ totalRs: 1000, discountRs: 200 })).toBe(1200);
    expect(subtotalOf({ totalRs: 1000, discountRs: null })).toBe(1000);
    expect(goodsOf(1300, 100)).toBe(1200);
    expect(goodsOf(50, 100)).toBe(0);
    expect(percentOf(1205, 10)).toBe(121);
    expect(percentOf(1250, 10)).toBe(125);
  });
});

describe("canEditDiscount (S-320 AC4, AC5)", () => {
  test("pending approval, awaiting payment and quotes, while unpaid", () => {
    for (const status of ["pending_approval", "awaiting_payment", "quote_needed", "quote_sent"] as const) {
      expect(canEditDiscount({ status, paid: false })).toBe(true);
      expect(canEditDiscount({ status, paid: true })).toBe(false);
    }
  });

  test("never once approved (paid), nor declined, cancelled or closed", () => {
    for (const status of ["approved", "in_preparation", "ready_for_pickup", "out_for_delivery", "completed", "declined", "cancelled", "closed"] as const) {
      expect(canEditDiscount({ status, paid: false })).toBe(false);
    }
  });
});

describe("rebaseDiscount (S-320 AC8)", () => {
  test("a percentage is recomputed on the new goods", () => {
    expect(rebaseDiscount({ discountRs: 120, percent: 10, reason: "Loyal" }, 1500)).toEqual({ discountRs: 150, percent: 10, reason: "Loyal" });
  });

  test("a fixed amount is capped at the new goods", () => {
    expect(rebaseDiscount({ discountRs: 300, percent: null, reason: null }, 1000)).toEqual({ discountRs: 300, percent: null, reason: null });
    expect(rebaseDiscount({ discountRs: 300, percent: null, reason: null }, 250)).toEqual({ discountRs: 250, percent: null, reason: null });
  });

  test("one that comes to Rs 0 is removed; none stays none", () => {
    expect(rebaseDiscount({ discountRs: 300, percent: null, reason: null }, 0)).toBeNull();
    expect(rebaseDiscount({ discountRs: 10, percent: 5, reason: null }, 5)).toBeNull();
    expect(rebaseDiscount(null, 1000)).toBeNull();
  });
});

describe("storedDiscount and lineAfterDiscount (S-320 AC10)", () => {
  test("columns to a value", () => {
    expect(storedDiscount({ discountRs: null, discountPercent: null, discountReason: null })).toBeNull();
    expect(storedDiscount({ discountRs: 50, discountPercent: 5, discountReason: "Promo" })).toEqual({ discountRs: 50, percent: 5, reason: "Promo" });
  });

  test("a line's share of the order discount is in proportion to its line total", () => {
    expect(lineAfterDiscount(800, 1200, 300)).toBe(600);
    expect(lineAfterDiscount(400, 1200, 300)).toBe(300);
    expect(lineAfterDiscount(400, 1200, null)).toBe(400);
    expect(lineAfterDiscount(0, 0, 100)).toBe(0);
  });
});
