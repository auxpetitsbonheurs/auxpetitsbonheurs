// Customer date rules (S-083, S-084; pricing spec T-AV-*, T-PRD-*). Fixed clocks only.
// Fixture: today Mon 2026-11-09, default notice 3, Sunday closed, no blocks, horizon 90.
import { describe, expect, test } from "vitest";
import {
  type AvailabilityCtx,
  DAY_HORIZON,
  type DayReason,
  adminDateWarnings,
  assertOrderable,
  dayStatus,
  dayStatuses,
  earliestDate,
  noticeDaysFor,
  productProblem,
  seasonBlocking,
} from "./availability";
import { DomainError } from "./errors";
import { addDays, isoWeekday, todayMU } from "./time";

const ctx = (over: Partial<AvailabilityCtx> = {}): AvailabilityCtx => ({
  today: "2026-11-09",
  defaultNoticeDays: 3,
  closedWeekdays: [7],
  blocked: [],
  ...over,
});

const reasonOf = (date: string, c = ctx(), notice = 3) => dayStatus(date, c, notice).reason;

describe("dayStatus (S-083 AC1, AC2)", () => {
  test("T-AV-1: Tue 10 and Wed 11 are too soon with notice 3", () => {
    expect([reasonOf("2026-11-10"), reasonOf("2026-11-11")]).toEqual(["too_soon", "too_soon"]);
  });

  test("T-AV-2: Thu 12 is available", () => {
    expect(dayStatus("2026-11-12", ctx(), 3)).toEqual({ date: "2026-11-12", available: true, reason: null });
  });

  test("T-AV-3: Sun 15 is closed", () => {
    expect(reasonOf("2026-11-15")).toBe("closed");
  });

  test("T-AV-4: today and a past date (even a closed Sunday) are too soon", () => {
    expect([reasonOf("2026-11-09"), reasonOf("2026-11-08")]).toEqual(["too_soon", "too_soon"]);
  });

  test("T-AV-5: notice 5 makes Thu 12 too soon and Sat 14 available", () => {
    expect([reasonOf("2026-11-12", ctx(), 5), reasonOf("2026-11-14", ctx(), 5)]).toEqual(["too_soon", null]);
  });

  test("T-AV-6: notice 0 allows today unless today is closed", () => {
    expect(reasonOf("2026-11-09", ctx(), 0)).toBeNull();
    expect(reasonOf("2026-11-09", ctx({ closedWeekdays: [1] }), 0)).toBe("closed");
  });
});

describe("noticeDaysFor (S-083 AC3, T-AV-22)", () => {
  test.each([
    [[null, 5], 5],
    [[1, null], 3],
    [[], 3],
    [[2], 2],
    [[0], 0],
  ] as const)("%j with default 3 gives %i (largest; unset counts as the default)", (notices, expected) => {
    expect(noticeDaysFor(notices.map((noticeDays) => ({ noticeDays })), 3)).toBe(expected);
  });
});

describe("blocked days (S-083 AC4, AC5)", () => {
  test("T-AV-7: a block 20-22 Nov includes both ends", () => {
    const c = ctx({ blocked: [{ startsOn: "2026-11-20", endsOn: "2026-11-22" }] });
    expect(["2026-11-19", "2026-11-20", "2026-11-22", "2026-11-23"].map((d) => reasonOf(d, c))).toEqual([null, "blocked", "blocked", null]);
  });

  test("T-AV-8: a single-day block on Fri 13 blocks only the 13th", () => {
    const c = ctx({ blocked: [{ startsOn: "2026-11-13", endsOn: "2026-11-13" }] });
    expect(["2026-11-12", "2026-11-13", "2026-11-14"].map((d) => reasonOf(d, c))).toEqual([null, "blocked", null]);
  });

  test("T-AV-9: blocked wins over closed", () => {
    expect(reasonOf("2026-11-22", ctx({ blocked: [{ startsOn: "2026-11-22", endsOn: "2026-11-22" }] }))).toBe("blocked");
  });

  test("T-AV-10: closed wins over too soon", () => {
    expect(reasonOf("2026-11-15", ctx({ today: "2026-11-13" }))).toBe("closed");
  });

  test("too soon wins over out of season, too far over out of season", () => {
    const season = [{ startsOn: "2026-12-01", endsOn: "2026-12-25" }];
    expect(dayStatus("2026-11-10", ctx(), 3, season).reason).toBe("too_soon");
    expect(dayStatus(addDays("2026-11-09", 120), ctx(), 3, season).reason).toBe("too_far");
  });
});

describe("closed weekdays and horizon (S-083 AC6, AC7)", () => {
  test("T-AV-11: closed [6,7] closes Saturday and Sunday", () => {
    const c = ctx({ closedWeekdays: [6, 7] });
    expect([reasonOf("2026-11-14", c), reasonOf("2026-11-15", c)]).toEqual(["closed", "closed"]);
  });

  test("T-AV-12: closed [] leaves Sunday available", () => {
    expect(reasonOf("2026-11-15", ctx({ closedWeekdays: [] }))).toBeNull();
  });

  test("T-AV-13: today+89 is available and today+90 too far", () => {
    const c = ctx({ closedWeekdays: [] });
    expect([reasonOf(addDays("2026-11-09", 89), c), reasonOf(addDays("2026-11-09", 90), c)]).toEqual([null, "too_far"]);
  });

  test("T-AV-18: dayStatuses lists 90 days starting today", () => {
    const days = dayStatuses(ctx(), 3);
    expect(days).toHaveLength(DAY_HORIZON);
    expect(days[0]!.date).toBe("2026-11-09");
    expect(days.at(-1)!.date).toBe(addDays("2026-11-09", 89));
  });

  test("property: available iff earliest <= d, not closed, not blocked, inside the horizon", () => {
    const blocked = [{ startsOn: "2026-12-24", endsOn: "2026-12-26" }];
    const c = ctx({ blocked, closedWeekdays: [1, 7] });
    for (let offset = -3; offset < 100; offset += 1) {
      const date = addDays("2026-11-09", offset);
      const expected = offset >= 3 && offset < 90 && ![1, 7].includes(isoWeekday(date)) && !(date >= "2026-12-24" && date <= "2026-12-26");
      expect(dayStatus(date, c, 3).available, date).toBe(expected);
    }
  });
});

describe("earliestDate (S-083 AC8, AC9)", () => {
  test("T-AV-14: notice 3 on Mon 9 gives Thu 12", () => {
    expect(earliestDate(ctx(), 3)).toBe("2026-11-12");
  });

  test("T-AV-15: Thu 12 blocked gives Fri 13", () => {
    expect(earliestDate(ctx({ blocked: [{ startsOn: "2026-11-12", endsOn: "2026-11-12" }] }), 3)).toBe("2026-11-13");
  });

  test("T-AV-16: from Thu 12 with Sunday closed gives Mon 16", () => {
    expect(earliestDate(ctx({ today: "2026-11-12" }), 3)).toBe("2026-11-16");
  });

  test("T-AV-17: every day blocked gives null", () => {
    expect(earliestDate(ctx({ blocked: [{ startsOn: "2026-11-01", endsOn: "2027-12-31" }] }), 3)).toBeNull();
  });

  test("T-AV-19, T-TM-1: Mauritius midnight moves the earliest date, never the server zone", () => {
    const at = (instant: string) => earliestDate(ctx({ today: todayMU(new Date(instant)) }), 3);
    expect(at("2026-11-09T19:59:00Z")).toBe("2026-11-12");
    expect(at("2026-11-09T20:00:00Z")).toBe("2026-11-13");
  });
});

describe("assertOrderable (S-083 AC10)", () => {
  test("T-AV-20: a closed day throws DATE_UNAVAILABLE with reason closed", () => {
    try {
      assertOrderable("2026-11-15", ctx(), 3);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).code).toBe("DATE_UNAVAILABLE");
      expect((error as DomainError).details).toEqual({ reason: "closed" satisfies DayReason });
    }
  });

  test("T-AV-21: an impossible date throws INVALID_DATE", () => {
    expect(() => assertOrderable("2026-02-30", ctx(), 3)).toThrow(expect.objectContaining({ code: "INVALID_DATE" }));
  });

  test("an available day passes", () => {
    expect(() => assertOrderable("2026-11-12", ctx(), 3)).not.toThrow();
  });
});

describe("DayStatus carries no private reason (S-083 AC11, FR-014)", () => {
  test("only date, available and reason, even when the block row had a private reason", () => {
    const block = { startsOn: "2026-11-20", endsOn: "2026-11-20", reason: "Family wedding" };
    const status = dayStatus("2026-11-20", ctx({ blocked: [block] }), 3);
    expect(Object.keys(status).sort()).toEqual(["available", "date", "reason"]);
    expect(JSON.stringify(dayStatuses(ctx({ blocked: [block] }), 3))).not.toContain("Family wedding");
  });
});

describe("adminDateWarnings (S-083 AC12, T-AV-23)", () => {
  test("blocked Fri 13 warns blocked; Sun 15 seen from Fri 13 warns closed and too soon", () => {
    expect(adminDateWarnings("2026-11-13", ctx({ blocked: [{ startsOn: "2026-11-13", endsOn: "2026-11-13" }] }), 3)).toEqual(["blocked"]);
    expect(adminDateWarnings("2026-11-15", ctx({ today: "2026-11-13" }), 3)).toEqual(["closed", "too_soon"]);
  });

  test("never throws, even on an impossible date", () => {
    expect(adminDateWarnings("2026-02-30", ctx(), 3)).toEqual([]);
  });
});

describe("productProblem by Mauritius date (S-084 AC1..AC3, T-PRD-*)", () => {
  const christmas = { startsOn: "2026-12-01", endsOn: "2026-12-25" };

  test("T-PRD-1: an available product without a window is fine", () => {
    expect(productProblem({ status: "available", season: null }, "2026-11-09")).toBeNull();
  });

  test("T-PRD-2, T-PRD-3: the end day is orderable, the day after is out of season", () => {
    expect(productProblem({ status: "available", season: christmas }, "2026-12-25")).toBeNull();
    expect(productProblem({ status: "available", season: christmas }, "2026-12-26")).toBe("out_of_season");
  });

  test("T-PRD-4: a window starting 26 Dec is out of season on the 25th, fine on the 26th", () => {
    const late = { startsOn: "2026-12-26", endsOn: "2026-12-31" };
    expect(productProblem({ status: "available", season: late }, "2026-12-25")).toBe("out_of_season");
    expect(productProblem({ status: "available", season: late }, "2026-12-26")).toBeNull();
  });

  test("T-PRD-5..7: hidden > out of season > sold out", () => {
    expect(productProblem({ status: "sold_out", season: null }, "2026-11-09")).toBe("sold_out");
    expect(productProblem({ status: "hidden", season: christmas }, "2026-11-09")).toBe("hidden");
    expect(productProblem({ status: "sold_out", season: christmas }, "2026-11-09")).toBe("out_of_season");
  });

  test("T-PRD-8: 2026-12-25T20:30Z is 26 Dec in Mauritius, so out of season", () => {
    expect(productProblem({ status: "available", season: christmas }, todayMU(new Date("2026-12-25T20:30:00Z")))).toBe("out_of_season");
  });
});

describe("seasonal windows on the fulfilment date (S-084 AC4)", () => {
  const untilChristmas = { startsOn: "2026-11-01", endsOn: "2026-12-25" };

  test("dates after 25 Dec are out of season, 24 Dec is available", () => {
    expect(dayStatus("2026-12-24", ctx(), 3, [untilChristmas]).reason).toBeNull();
    expect(dayStatus("2026-12-26", ctx(), 3, [untilChristmas]).reason).toBe("out_of_season");
  });

  test("with two seasonal items the date must lie inside both windows", () => {
    const fromDecember = { startsOn: "2026-12-10", endsOn: "2027-01-10" };
    const windows = [untilChristmas, fromDecember];
    expect(["2026-12-09", "2026-12-10", "2026-12-25", "2026-12-26"].map((d) => dayStatus(d, ctx(), 3, windows).reason)).toEqual(["out_of_season", null, null, "out_of_season"]);
  });

  test("seasonBlocking names the first item whose window leaves the date out", () => {
    const items = [
      { name: "Yule log", startsOn: "2026-11-01", endsOn: "2026-12-25" },
      { name: "Galette", startsOn: "2027-01-01", endsOn: "2027-01-31" },
    ];
    expect(seasonBlocking("2026-12-26", items)?.name).toBe("Yule log");
    expect(seasonBlocking("2026-12-20", items)?.name).toBe("Galette");
    expect(seasonBlocking("2026-12-20", [items[0]!])).toBeNull();
  });
});
