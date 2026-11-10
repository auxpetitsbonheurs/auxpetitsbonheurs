import { describe, expect, test, vi } from "vitest";
import en from "./en.json";
import fr from "./fr.json";
import { messagesFor, t } from "./catalog.server";
import { SKELETON_KEYS } from "./skeleton-keys";
import { createTranslator } from "./translator";

function leaf(messages: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], messages);
}

/** Plural keys are stored as key_one / key_other. */
function texts(messages: unknown, key: string): unknown[] {
  const direct = leaf(messages, key);
  return direct === undefined ? [leaf(messages, `${key}_one`), leaf(messages, `${key}_other`)] : [direct];
}

describe("t (AC1: French text with English fallback)", () => {
  test("returns the French text when it exists", () => {
    expect(t("checkout.title", "fr")).toBe(leaf(fr, "checkout.title"));
    expect(t("checkout.title", "fr")).not.toBe(t("checkout.title", "en"));
  });

  test("falls back to English when the French text is missing or blank", () => {
    const translate = createTranslator(
      "fr",
      messagesFor("fr", { checkout: { title: "Checkout" }, other: "Other" }, { checkout: { title: "  " } }),
    );

    expect(translate("checkout.title")).toBe("Checkout");
    expect(translate("other")).toBe("Other");
  });

  test("interpolates values", () => {
    const translate = createTranslator("en", { hello: "Hello {{name}}" });

    expect(translate("hello", { name: "Sabera" })).toBe("Hello Sabera");
  });
});

describe("catalogue completeness (AC3)", () => {
  test.each(SKELETON_KEYS)("%s has non-empty EN and FR text", (key) => {
    for (const messages of [en, fr]) {
      const values = texts(messages, key);
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(typeof value).toBe("string");
        expect(String(value).trim()).not.toBe("");
      }
    }
  });
});

describe("plurals (AC4)", () => {
  const messages = { basket: { items_one: "{{count}} one", items_other: "{{count}} other" } };

  test.each([
    [0, "0 one"],
    [1, "1 one"],
    [2, "2 other"],
  ])("French uses the singular for 0 and 1: %i", (count, expected) => {
    expect(createTranslator("fr", messages)("basket.items", { count })).toBe(expected);
  });

  test.each([
    [0, "0 other"],
    [1, "1 one"],
    [2, "2 other"],
  ])("English uses the singular only for 1: %i", (count, expected) => {
    expect(createTranslator("en", messages)("basket.items", { count })).toBe(expected);
  });
});

describe("missing keys (AC10)", () => {
  test("returns the key and warns in development", () => {
    const warn = vi.fn();
    const translate = createTranslator("en", {}, { mode: "development", warn });

    expect(translate("nope.missing")).toBe("nope.missing");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("nope.missing"));
  });

  test("returns the key silently and never throws in production", () => {
    const warn = vi.fn();
    const translate = createTranslator("fr", {}, { mode: "production", warn });

    expect(() => translate("nope.missing", { count: 3 })).not.toThrow();
    expect(translate("nope.missing")).toBe("nope.missing");
    expect(warn).not.toHaveBeenCalled();
  });
});
