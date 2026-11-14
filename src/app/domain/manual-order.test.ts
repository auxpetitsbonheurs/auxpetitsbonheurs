// Manual order date rules and warnings (S-134 AC1-AC7; owner Q8, Q9, Q21).
import { describe, expect, test } from "vitest";
import { manualDateProblem, manualOrderWarnings } from "./manual-order";

const rules = { defaultNoticeDays: 3, closedWeekdays: [7], blocked: [{ startsOn: "2026-12-12", endsOn: "2026-12-12" }] };
const today = "2026-12-10"; // Thursday

describe("manualOrderWarnings", () => {
  test("a blocked day warns and a closed weekday warns as closed (AC1)", () => {
    expect(manualOrderWarnings({ date: "2026-12-12", today, rules, noticeDays: 0, soldOut: false })).toEqual(["blocked"]);
    expect(manualOrderWarnings({ date: "2026-12-20", today, rules, noticeDays: 0, soldOut: false })).toEqual(["closed"]);
  });

  test("too soon for the largest notice; blocked and too soon together (AC2, AC3)", () => {
    expect(manualOrderWarnings({ date: "2026-12-11", today, rules, noticeDays: 3, soldOut: false })).toEqual(["too_soon"]);
    expect(manualOrderWarnings({ date: "2026-12-12", today, rules, noticeDays: 3, soldOut: false })).toEqual(["blocked", "too_soon"]);
    expect(manualOrderWarnings({ date: "2026-12-14", today, rules, noticeDays: 3, soldOut: false })).toEqual([]);
  });

  test("a past date warns past_date only: no notice, closed or blocked check (AC4)", () => {
    expect(manualOrderWarnings({ date: "2026-12-06", today, rules, noticeDays: 3, soldOut: true })).toEqual(["past_date", "sold_out"]);
  });

  test("sold-out lines add sold_out (AC5)", () => {
    expect(manualOrderWarnings({ date: "2026-12-14", today, rules, noticeDays: 3, soldOut: true })).toEqual(["sold_out"]);
  });
});

describe("manualDateProblem (AC6)", () => {
  test("any past day and up to 365 days ahead are fine", () => {
    expect(manualDateProblem("2020-01-01", today)).toBeNull();
    expect(manualDateProblem("2027-12-10", today)).toBeNull();
  });

  test("beyond 365 days or an impossible date is refused", () => {
    expect(manualDateProblem("2027-12-11", today)).toBe("too_far");
    expect(manualDateProblem("2026-02-30", today)).toBe("invalid");
  });
});
