// S-059 AC4 (FR-010): the policies keep a cancellation and a storage entry (keyword check,
// case-insensitive; French checked when it has text). Warning only.
import { describe, expect, test } from "vitest";
import { overlappingWindows, isCalendarDate, minutesOf, newWindowId } from "./availability";
import { policiesMissingEntries, privacyNoteMissingReviews } from "./settings";

describe("policiesMissingEntries (S-059 AC4)", () => {
  test.each([
    [null, true],
    [{ en: "" }, true],
    [{ en: "Cancellation up to 48 h before." }, true],
    [{ en: "Keep in storage below 5 °C." }, true],
    [{ en: "CANCELLATION: 48 h. STORAGE: fridge." }, false],
    [{ en: "Cancellation: 48 h. Storage: fridge.", fr: "Annulation : 48 h." }, true],
    [{ en: "Cancellation: 48 h. Storage: fridge.", fr: "Annulation : 48 h. Conservation : au frais." }, false],
    [{ en: "Cancellation: 48 h. Storage: fridge.", fr: "   " }, false],
  ])("%o -> missing %s", (policies, missing) => {
    expect(policiesMissingEntries(policies)).toBe(missing);
  });
});

describe("availability helpers (S-056, S-057)", () => {
  test("minutesOf reads HH:mm only", () => {
    expect(minutesOf("09:30")).toBe(570);
    expect(minutesOf("9:30")).toBeNaN();
    expect(minutesOf("24:00")).toBeNaN();
  });

  test("windows that share only an end do not overlap; others do", () => {
    expect(overlappingWindows([{ start: "09:00", end: "12:00" }, { start: "12:00", end: "17:00" }])).toEqual([]);
    expect(overlappingWindows([{ start: "09:00", end: "12:00" }, { start: "17:00", end: "20:00" }, { start: "11:00", end: "13:00" }])).toEqual([0, 2]);
  });

  test("calendar dates must exist", () => {
    expect(isCalendarDate("2026-12-24")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("24/12/2026")).toBe(false);
  });

  test("new window ids are short and match the id rule", () => {
    expect(newWindowId(() => 0.5)).toBe("w-7fffff");
  });
});

describe("privacyNoteMissingReviews (E-14 S-268 AC4)", () => {
  test.each([
    [{ en: "We keep your orders. Reviews show your first name and initial; delete yours any time." }, false],
    [{ en: "We keep your orders for five years." }, true],
    [null, true],
    [{ en: "Your review shows your first name.", fr: "Nous gardons vos commandes." }, true],
    [{ en: "Your review shows your first name.", fr: "Votre avis montre votre prénom." }, false],
  ])("%j -> missing %s", (note, missing) => {
    expect(privacyNoteMissingReviews(note)).toBe(missing);
  });
});

