import { describe, expect, test } from "vitest";
import { normalizePhone } from "./phone";

describe("normalizePhone (S-013 AC1, checkout spec 'Phone normalisation')", () => {
  test.each([
    ["5712 3456", "+23057123456"],
    ["+230 5712 3456", "+23057123456"],
    ["00 33 6 12 34 56 78", "+33612345678"],
    ["230 5712 3456", "+23057123456"],
    ["(230) 5712-3456", "+23057123456"],
    ["212.3456", "+2302123456"],
  ])("%s is stored as %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  test.each(["12345", "", "+1234567", "+1234567890123456", "abc 5712 3456", "123456789"])("%s is not a phone number", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});
