import { describe, expect, test } from "vitest";
import { DomainError } from "./errors";
import { formatDayLabel, formatLogTime, muDateTimeToInstant, todayMU } from "./time";

describe("todayMU (AC6: UTC+4, no DST)", () => {
  test.each([
    ["2026-11-10T19:59:59Z", "2026-11-10"],
    ["2026-11-10T20:00:00Z", "2026-11-11"],
    ["2026-06-30T20:00:00Z", "2026-07-01"],
    ["2030-12-31T20:30:00Z", "2031-01-01"],
  ])("%s is %s in Mauritius", (instant, date) => {
    expect(todayMU(new Date(instant))).toBe(date);
  });
});

describe("muDateTimeToInstant (AC7)", () => {
  test("converts Mauritius wall time to the UTC instant", () => {
    expect(muDateTimeToInstant("2026-11-12T18:00").toISOString()).toBe("2026-11-12T14:00:00.000Z");
  });

  test("handles a Mauritius time that is the previous day in UTC", () => {
    expect(muDateTimeToInstant("2026-01-01T02:30").toISOString()).toBe("2025-12-31T22:30:00.000Z");
  });

  test.each(["2026-02-30T10:00", "2026-02-29T10:00", "2026-13-01T10:00", "2026-11-12T24:00", "2026-11-12T18:60", "12/11/2026 18:00", ""])(
    "rejects %j with a typed DomainError (no silent rollover)",
    (value) => {
      expect(() => muDateTimeToInstant(value)).toThrow(DomainError);
      try {
        muDateTimeToInstant(value);
      } catch (error) {
        expect((error as DomainError).code).toBe("INVALID_DATE_TIME");
      }
    },
  );

  test("accepts 29 February in a leap year", () => {
    expect(muDateTimeToInstant("2028-02-29T10:00").toISOString()).toBe("2028-02-29T06:00:00.000Z");
  });
});

describe("formatting (AC9)", () => {
  test.each(["en", "fr"] as const)("admin log time reads '12 Nov 14:05' in %s (Mauritius time)", (locale) => {
    expect(formatLogTime(new Date("2026-11-12T10:05:00Z"), locale)).toBe("12 Nov 14:05");
  });

  test("a date formats as 'Thu 12 Nov' in English", () => {
    expect(formatDayLabel("2026-11-12", "en")).toBe("Thu 12 Nov");
  });

  test("a date formats as 'jeu. 12 nov.' in French", () => {
    expect(formatDayLabel("2026-11-12", "fr")).toBe("jeu. 12 nov.");
  });

  test("a malformed date is a DomainError", () => {
    expect(() => formatDayLabel("2026-02-30", "en")).toThrow(DomainError);
  });
});
