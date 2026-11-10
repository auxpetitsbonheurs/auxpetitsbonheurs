import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES, localeFromPathname, localePath } from "./locale";
import { formatRupees } from "./locale";

describe("formatRupees", () => {
  it("formats whole rupees with a thousands separator", () => {
    expect(formatRupees(1250)).toBe("Rs 1,250");
  });

  it("rounds to whole rupees with no decimals", () => {
    expect(formatRupees(199.6)).toBe("Rs 200");
  });

  describe.each(SUPPORTED_LOCALES)("S-006 AC8 in %s (one format for both languages)", (locale) => {
    it.each([
      [0, "Rs 0"],
      [200, "Rs 200"],
      [1250, "Rs 1,250"],
      [1_000_000, "Rs 1,000,000"],
    ])("%i -> %s", (amount, expected) => {
      expect(formatRupees(amount, locale)).toBe(expected);
    });
  });
});

describe("localeFromPathname (S-006: URL is authoritative)", () => {
  it.each([
    ["/", "en"],
    ["/menu", "en"],
    ["/fr", "fr"],
    ["/fr/", "fr"],
    ["/fr/menu", "fr"],
    ["/fresh", "en"],
    ["/FR/menu", "en"],
  ])("%s -> %s", (path, locale) => {
    expect(localeFromPathname(path)).toBe(locale);
  });
});

describe("localePath (S-007/S-008: links stay in the page language)", () => {
  it.each([
    ["en", "/", "/"],
    ["en", "/basket", "/basket"],
    ["fr", "/", "/fr/"],
    ["fr", "/basket", "/fr/basket"],
  ] as const)("%s %s -> %s", (locale, path, expected) => {
    expect(localePath(locale, path)).toBe(expected);
  });
});
