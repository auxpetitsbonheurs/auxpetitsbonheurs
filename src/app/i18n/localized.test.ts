import { describe, expect, test } from "vitest";
import { localized } from "./localized";

describe("localized (AC2)", () => {
  test.each([null, undefined, "", "   ", "\n\t"])("French %j falls back to English", (frText) => {
    expect(localized({ en: "Cake", fr: frText }, "fr")).toBe("Cake");
  });

  test("returns the French when both are present", () => {
    expect(localized({ en: "Cake", fr: "Gâteau" }, "fr")).toBe("Gâteau");
  });

  test("returns the English for an English page", () => {
    expect(localized({ en: "Cake", fr: "Gâteau" }, "en")).toBe("Cake");
  });
});
