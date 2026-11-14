// Sales summary rules (S-171, S-172, S-173; spec admin-sales-customers "Definitions").
import { describe, expect, test } from "vitest";
import {
  REVENUE_STATUSES,
  UNPAID_STATUSES,
  averageRs,
  formatRangeLabel,
  resolveSalesRange,
  summarise,
  topProducts,
} from "./sales";

describe("which orders count (S-171 AC1, AC2; S-173 AC3)", () => {
  test("revenue counts Completed orders only; approved, cancelled, declined and awaiting payment never count", () => {
    expect([...REVENUE_STATUSES]).toEqual(["completed"]);
  });

  test("the unpaid list is the confirmed group: approved to completed, never pending, quotes, stopped or awaiting payment", () => {
    expect([...UNPAID_STATUSES].sort()).toEqual(["approved", "completed", "in_preparation", "out_for_delivery", "ready_for_pickup"]);
    for (const status of ["awaiting_payment", "pending_approval", "quote_needed", "quote_sent", "declined", "cancelled", "closed"]) {
      expect(UNPAID_STATUSES.has(status as never)).toBe(false);
    }
  });
});

describe("averageRs (S-171 AC3, AC4)", () => {
  test("rounds half up to whole rupees", () => {
    expect(averageRs(3500, 3)).toBe(1167);
    expect(averageRs(12_000, 10)).toBe(1200);
    expect(averageRs(5, 2)).toBe(3);
  });

  test("zero orders gives Rs 0, not a division error", () => {
    expect(averageRs(0, 0)).toBe(0);
  });
});

describe("summarise (S-171 AC1, S-172 AC1, AC4)", () => {
  test("totals, delivery vs pickup and by source all add up to revenue", () => {
    const summary = summarise([
      { fulfilment: "delivery", source: "website", orderCount: 4, revenueRs: 5000 },
      { fulfilment: "delivery", source: "manual", orderCount: 2, revenueRs: 2000 },
      { fulfilment: "pickup", source: "website", orderCount: 3, revenueRs: 3000 },
      { fulfilment: "pickup", source: "custom_request", orderCount: 1, revenueRs: 2000 },
    ]);
    expect(summary).toEqual({
      revenueRs: 12_000,
      orderCount: 10,
      averageRs: 1200,
      delivery: 6,
      pickup: 4,
      deliveryRevenueRs: 7000,
      pickupRevenueRs: 5000,
      bySource: { website: 8000, custom_request: 2000, manual: 2000, workshop: 0 },
    });
  });

  test("no orders: zeros everywhere and all three sources listed", () => {
    expect(summarise([])).toEqual({
      revenueRs: 0,
      orderCount: 0,
      averageRs: 0,
      delivery: 0,
      pickup: 0,
      deliveryRevenueRs: 0,
      pickupRevenueRs: 0,
      bySource: { website: 0, custom_request: 0, manual: 0, workshop: 0 },
    });
  });
});

describe("topProducts (S-172 AC2, AC3)", () => {
  const p = (name: string, quantity: number, revenueRs: number) => ({ productId: name, name, quantity, revenueRs });

  test("five with most units, ties by revenue then name", () => {
    const top = topProducts([p("G", 1, 100), p("A", 5, 500), p("B", 5, 900), p("C", 3, 300), p("E", 2, 200), p("D", 2, 200), p("F", 1, 900)]);
    expect(top.map((row) => row.name)).toEqual(["B", "A", "C", "D", "E"]);
    expect(top[0]).toEqual({ name: "B", quantity: 5, revenueRs: 900 });
  });

  test("free-text items (no product) are never ranked; fewer than five shows fewer", () => {
    const top = topProducts([p("A", 1, 100), { productId: null, name: "Balloon", quantity: 50, revenueRs: 5000 }]);
    expect(top).toEqual([{ name: "A", quantity: 1, revenueRs: 100 }]);
  });
});

describe("resolveSalesRange (S-171 AC5, AC6)", () => {
  const today = "2026-11-13"; // a Friday

  test("default is This month, in Mauritius dates", () => {
    expect(resolveSalesRange({}, today)).toEqual({ ok: true, range: "month", from: "2026-11-01", to: "2026-11-30" });
    expect(resolveSalesRange({ range: "nonsense" }, today)).toMatchObject({ ok: true, range: "month" });
  });

  test("This week runs Monday to Sunday", () => {
    expect(resolveSalesRange({ range: "week" }, today)).toEqual({ ok: true, range: "week", from: "2026-11-09", to: "2026-11-15" });
    expect(resolveSalesRange({ range: "week" }, "2026-11-15")).toMatchObject({ from: "2026-11-09", to: "2026-11-15" });
    expect(resolveSalesRange({ range: "week" }, "2026-11-16")).toMatchObject({ from: "2026-11-16", to: "2026-11-22" });
  });

  test("Last month is the previous calendar month, across a year", () => {
    expect(resolveSalesRange({ range: "last_month" }, today)).toMatchObject({ from: "2026-10-01", to: "2026-10-31" });
    expect(resolveSalesRange({ range: "last_month" }, "2027-01-05")).toMatchObject({ from: "2026-12-01", to: "2026-12-31" });
    expect(resolveSalesRange({ range: "last_month" }, "2028-03-31")).toMatchObject({ from: "2028-02-01", to: "2028-02-29" });
  });

  test("Custom accepts from <= to up to 366 days, future dates too", () => {
    expect(resolveSalesRange({ range: "custom", from: "2026-11-05", to: "2026-11-05" }, today)).toEqual({ ok: true, range: "custom", from: "2026-11-05", to: "2026-11-05" });
    expect(resolveSalesRange({ range: "custom", from: "2026-01-01", to: "2027-01-01" }, today)).toMatchObject({ ok: true });
    expect(resolveSalesRange({ range: "custom", from: "2027-06-01", to: "2027-06-30" }, today)).toMatchObject({ ok: true });
  });

  test("Custom refuses from > to, over 366 days and invalid dates", () => {
    expect(resolveSalesRange({ range: "custom", from: "2026-11-10", to: "2026-11-09" }, today)).toEqual({ ok: false, range: "custom", from: "2026-11-10", to: "2026-11-09", problem: "order" });
    expect(resolveSalesRange({ range: "custom", from: "2026-01-01", to: "2027-01-02" }, today)).toMatchObject({ ok: false, problem: "tooLong" });
    expect(resolveSalesRange({ range: "custom", from: "2026-02-30", to: "2026-03-01" }, today)).toMatchObject({ ok: false, problem: "invalid" });
    expect(resolveSalesRange({ range: "custom", from: "", to: "2026-03-01" }, today)).toMatchObject({ ok: false, problem: "invalid" });
    expect(resolveSalesRange({ range: "custom", to: "2026-03-01" }, today)).toMatchObject({ ok: false, problem: "invalid" });
  });
});

describe("formatRangeLabel (S-171 AC5, AC11)", () => {
  test("one month reads 1-30 Nov 2026; French spells the month out", () => {
    expect(formatRangeLabel("2026-11-01", "2026-11-30", "en")).toBe("1–30 Nov 2026");
    expect(formatRangeLabel("2026-11-01", "2026-11-30", "fr")).toBe("1–30 novembre 2026");
  });

  test("across months and years, and a single day", () => {
    expect(formatRangeLabel("2026-10-26", "2026-11-01", "en")).toBe("26 Oct – 1 Nov 2026");
    expect(formatRangeLabel("2026-12-28", "2027-01-03", "en")).toBe("28 Dec 2026 – 3 Jan 2027");
    expect(formatRangeLabel("2026-11-05", "2026-11-05", "fr")).toBe("5 novembre 2026");
  });
});
