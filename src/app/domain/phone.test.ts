import { describe, expect, test } from "vitest";
import { normalizePhone, whatsappDigits } from "./phone";

describe("normalizePhone (S-013 AC1, checkout spec 'Phone normalisation')", () => {
  test.each([
    ["5712 3456", "+23057123456"],
    ["+230 5712 3456", "+23057123456"],
    ["00 33 6 12 34 56 78", "+33612345678"],
    ["230 5712 3456", "+23057123456"],
    ["23057123456", "+23057123456"],
    ["(230) 5712-3456", "+23057123456"],
    ["212.3456", "+2302123456"],
  ])("%s is stored as %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each(["12345", "", "+1234567", "+1234567890123456", "abc 5712 3456", "123456789"])("%s is not a phone number", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("Mauritius-friendly E.164 (E-10 S-204, spec AC32-AC35)", () => {
  test.each([
    ["AC1", "5712 3456", "+23057123456"],
    ["AC2", "+44 7700 900123", "+447700900123"],
    ["AC2", "0033 6 12 34 56 78", "+33612345678"],
    ["AC3", "23057123456", "+23057123456"],
    ["AC3", "+230 5712 3456", "+23057123456"],
    ["AC5", "(+230) 5712-34.56", "+23057123456"],
  ])("%s: %s is stored as %s", (_ac, input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each(["123", "phone", "5712 345a", "+2305712345678901"])("AC4: %s is refused", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });

  test("AC4: the refusal has a field message in English and French", async () => {
    const { t } = await import("~/i18n/catalog.server");
    expect(t("checkout.errors.contactPhone", "en")).toBe("Enter a phone number, for example 5712 3456.");
    expect(t("checkout.errors.contactPhone", "fr")).not.toBe(t("checkout.errors.contactPhone", "en"));
  });

  test("AC6: the WhatsApp digits are the E.164 value without +", () => {
    expect(whatsappDigits(normalizePhone("5712 3456")!)).toBe("23057123456");
  });
});
