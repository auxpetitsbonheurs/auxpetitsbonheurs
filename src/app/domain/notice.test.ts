import { describe, expect, test } from "vitest";
import { earliestProductDate } from "./notice";

describe("earliestProductDate (S-065 AC3)", () => {
  test("today + notice days when that day is open", () => {
    // 2026-11-10 is a Tuesday; + 5 = Sunday 15th is closed by default below, so use no closed days here.
    expect(earliestProductDate({ today: "2026-11-10", noticeDays: 5, closedWeekdays: [], blocked: [] })).toBe("2026-11-15");
  });

  test("a closed weekday moves to the next open day", () => {
    expect(earliestProductDate({ today: "2026-11-10", noticeDays: 5, closedWeekdays: [7], blocked: [] })).toBe("2026-11-16");
  });

  test("blocked ranges (inclusive) are skipped, across a month end", () => {
    expect(
      earliestProductDate({ today: "2026-11-26", noticeDays: 3, closedWeekdays: [7], blocked: [{ startsOn: "2026-11-28", endsOn: "2026-12-01" }] }),
    ).toBe("2026-12-02");
  });

  test("0 days of notice is today when open", () => {
    expect(earliestProductDate({ today: "2026-11-10", noticeDays: 0, closedWeekdays: [7], blocked: [] })).toBe("2026-11-10");
  });

  test("no open day within the horizon gives null instead of looping", () => {
    expect(earliestProductDate({ today: "2026-11-10", noticeDays: 1, closedWeekdays: [1, 2, 3, 4, 5, 6, 7], blocked: [] })).toBeNull();
  });
});
