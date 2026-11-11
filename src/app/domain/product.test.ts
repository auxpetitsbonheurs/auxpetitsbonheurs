import { describe, expect, test } from "vitest";
import { SLUG_PATTERN, seasonalTag, slugFromName } from "./product";

describe("slugFromName (S-046 AC5)", () => {
  test.each([
    ["Chocolate cake", "chocolate-cake"],
    ["Crème brûlée", "creme-brulee"],
    ["  Red velvet -- 2 layers! ", "red-velvet-2-layers"],
    ["🎂", "product"],
  ])("%s -> %s", (name, slug) => {
    expect(slugFromName(name)).toBe(slug);
    expect(slugFromName(name)).toMatch(SLUG_PATTERN);
  });

  test("never longer than 80 characters and never ends on a dash", () => {
    const slug = slugFromName(`${"a".repeat(79)} b`);
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug).toMatch(SLUG_PATTERN);
  });
});

describe("seasonalTag (S-041 AC1)", () => {
  const window = { type: "cake", seasonalStartsOn: "2026-12-01", seasonalEndsOn: "2026-12-24" };

  test("before the window opens it is scheduled", () => {
    expect(seasonalTag(window, "2026-11-30")).toBe("scheduled");
  });

  test("inside the window (both ends inclusive) it is current", () => {
    expect(seasonalTag(window, "2026-12-01")).toBe("current");
    expect(seasonalTag(window, "2026-12-24")).toBe("current");
  });

  test("after the window it is ended", () => {
    expect(seasonalTag(window, "2026-12-25")).toBe("ended");
  });

  test("a Seasonal-type product with no dates is current; any other type has no tag", () => {
    expect(seasonalTag({ type: "seasonal", seasonalStartsOn: null, seasonalEndsOn: null }, "2026-11-10")).toBe("current");
    expect(seasonalTag({ type: "cake", seasonalStartsOn: null, seasonalEndsOn: null }, "2026-11-10")).toBeNull();
  });
});
