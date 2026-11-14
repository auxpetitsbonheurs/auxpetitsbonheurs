// Calendar month/week geometry and day flags (S-136 AC3, AC4, AC6, AC7; S-137 AC6; S-138 AC5, AC10).
import { describe, expect, test } from "vitest";
import { calendarDayFlags, monthGrid, parseCalendarQuery, shiftMonth, weekOf } from "./calendar";

describe("monthGrid (S-136 AC6)", () => {
  test("weeks start Monday and cover the whole month: Nov 2026 is 6 weeks from Mon 26 Oct", () => {
    const weeks = monthGrid("2026-11");
    expect(weeks).toHaveLength(6);
    expect(weeks[0]![0]).toEqual({ date: "2026-10-26", inMonth: false });
    expect(weeks[0]![6]).toEqual({ date: "2026-11-01", inMonth: true });
    expect(weeks.at(-1)![0]!.date).toBe("2026-11-30");
    expect(weeks.every((week) => week.length === 7)).toBe(true);
  });

  test("a month starting on Monday with 28 days is 4 weeks; Dec 2026 is 5", () => {
    expect(monthGrid("2027-02")).toHaveLength(4);
    expect(monthGrid("2026-12")).toHaveLength(5);
  });
});

describe("shiftMonth across a year boundary (S-136 AC6)", () => {
  test("previous of January and next of December", () => {
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });
});

describe("weekOf", () => {
  test("Monday to Sunday around a Sunday", () => {
    expect(weekOf("2026-11-15")).toEqual(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]);
  });
});

describe("parseCalendarQuery (S-136 AC6, S-137 AC6)", () => {
  const today = "2026-11-14";
  const parse = (query: string) => parseCalendarQuery(new URLSearchParams(query), today);

  test("defaults to this month (Mauritius today)", () => {
    expect(parse("")).toEqual({ ok: true, view: "month", month: "2026-11", date: "2026-11-14", from: "2026-10-26", to: "2026-12-06" });
  });

  test("month view covers its grid; week and day views their dates", () => {
    expect(parse("month=2027-01")).toMatchObject({ ok: true, view: "month", month: "2027-01", from: "2026-12-28", to: "2027-01-31" });
    expect(parse("view=week&date=2026-12-12")).toMatchObject({ ok: true, view: "week", month: "2026-12", from: "2026-12-07", to: "2026-12-13" });
    expect(parse("view=day&date=2026-12-12")).toMatchObject({ ok: true, view: "day", month: "2026-12", date: "2026-12-12", from: "2026-12-12", to: "2026-12-12" });
  });

  test.each(["month=2026-13", "month=26-11", "month=2026-1", "view=day&date=2026-02-30", "view=week&date=nope", "view=year", "view=day"])("%s is refused", (query) => {
    expect(parse(query)).toEqual({ ok: false });
  });
});

describe("calendarDayFlags (S-136 AC3, AC4; S-138 AC5)", () => {
  const blocks = [
    { startsOn: "2026-12-12", endsOn: "2026-12-12", reason: "Family event" },
    { startsOn: "2026-12-20", endsOn: "2026-12-27", reason: null },
    { startsOn: "2026-12-22", endsOn: "2026-12-22", reason: "Dentist" },
  ];

  test("a single-day block", () => {
    expect(calendarDayFlags("2026-12-12", blocks, [7])).toEqual({ blocked: true, blockKind: "single", blockReason: "Family event", closedDay: false });
  });

  test("a range wins over a single block on the same day; its reason, else the single one", () => {
    expect(calendarDayFlags("2026-12-22", blocks, [7])).toEqual({ blocked: true, blockKind: "range", blockReason: "Dentist", closedDay: false });
    expect(calendarDayFlags("2026-12-21", blocks, [7])).toEqual({ blocked: true, blockKind: "range", blockReason: null, closedDay: false });
  });

  test("a closed weekday is not a block (Sun 13 Dec)", () => {
    expect(calendarDayFlags("2026-12-13", blocks, [7])).toEqual({ blocked: false, blockKind: null, blockReason: null, closedDay: true });
  });
});
