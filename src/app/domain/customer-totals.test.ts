// Customer order count and total spent (S-174 AC2, S-176 AC2; owner decision 5).
import { describe, expect, test } from "vitest";
import { COUNTED_STATUSES, DELETED_CUSTOMER_NAME, SPENT_STATUSES, customerTotals, isAnonymised } from "./customer-totals";

describe("customerTotals", () => {
  test("AC2: completed Rs 1,000 + completed Rs 500 + cancelled = 2 orders, Rs 1,500", () => {
    expect(
      customerTotals([
        { status: "completed", totalRs: 1000 },
        { status: "completed", totalRs: 500 },
        { status: "cancelled", totalRs: 900 },
      ]),
    ).toEqual({ orderCount: 2, totalSpentRs: 1500 });
  });

  test("declined and closed never count; confirmed but not completed counts as an order, not as spent", () => {
    expect(
      customerTotals([
        { status: "declined", totalRs: 100 },
        { status: "closed", totalRs: 100 },
        { status: "approved", totalRs: 700 },
        { status: "awaiting_payment", totalRs: 300 },
      ]),
    ).toEqual({ orderCount: 2, totalSpentRs: 0 });
  });

  test("the status sets", () => {
    expect([...SPENT_STATUSES]).toEqual(["completed"]);
    for (const stopped of ["declined", "cancelled", "closed"] as const) expect(COUNTED_STATUSES.has(stopped)).toBe(false);
  });
});

describe("isAnonymised (S-174 AC6, data-model retention)", () => {
  test("the anonymised_at column marks a deleted customer (PRV-02), not the name", () => {
    expect(isAnonymised({ anonymisedAt: new Date("2026-11-14T00:00:00Z") })).toBe(true);
    expect(isAnonymised({ anonymisedAt: null })).toBe(false);
  });

  test("the placeholder the anonymise writes is 'Deleted customer'", () => {
    expect(DELETED_CUSTOMER_NAME).toBe("Deleted customer");
  });
});
