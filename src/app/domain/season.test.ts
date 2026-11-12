// S-049 AC4, AC5 (and the field rule behind AC2, AC3): the seasonal window predicate.
import { describe, expect, test } from "vitest";
import { checkSeason, isInSeason } from "./season";

const CHRISTMAS = { startsOn: "2026-12-01", endsOn: "2026-12-24" };

describe("isInSeason (AC4)", () => {
  test.each([
    ["2026-11-30", false],
    ["2026-12-01", true],
    ["2026-12-15", true],
    ["2026-12-24", true],
    ["2026-12-25", false],
  ])("1 to 24 Dec on %s -> %s (both ends included)", (date, expected) => {
    expect(isInSeason(CHRISTMAS, date)).toBe(expected);
  });

  test("no window: in season on any date", () => {
    expect(isInSeason(null, "2026-01-01")).toBe(true);
    expect(isInSeason(null, "2030-06-30")).toBe(true);
  });
});

describe("one-day window (AC5)", () => {
  test("start equal to end is valid and covers that day only", () => {
    const result = checkSeason("2026-02-14", "2026-02-14");

    expect(result).toEqual({ ok: true, window: { startsOn: "2026-02-14", endsOn: "2026-02-14" } });
    expect(isInSeason({ startsOn: "2026-02-14", endsOn: "2026-02-14" }, "2026-02-14")).toBe(true);
    expect(isInSeason({ startsOn: "2026-02-14", endsOn: "2026-02-14" }, "2026-02-15")).toBe(false);
  });
});

describe("checkSeason (field rule for AC2, AC3)", () => {
  test.each([
    ["only a start", "2026-12-01", "", "pair"],
    ["only an end", "", "2026-12-24", "pair"],
    ["start after end", "2026-12-24", "2026-12-01", "order"],
    ["a date that does not exist", "2026-02-30", "2026-03-01", "invalid"],
    ["not a date", "1 Dec", "2026-12-24", "invalid"],
  ])("%s -> %s", (_label, start, end, problem) => {
    expect(checkSeason(start, end)).toEqual({ ok: false, problem });
  });

  test("both blank: not seasonal", () => {
    expect(checkSeason(" ", "")).toEqual({ ok: true, window: null });
  });
});
