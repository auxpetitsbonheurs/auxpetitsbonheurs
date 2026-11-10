import { describe, expect, it } from "vitest";
import { formatRupees } from "./locale";

describe("formatRupees", () => {
  it("formats whole rupees with a thousands separator", () => {
    expect(formatRupees(1250)).toBe("Rs 1,250");
  });

  it("rounds to whole rupees with no decimals", () => {
    expect(formatRupees(199.6)).toBe("Rs 200");
  });
});
