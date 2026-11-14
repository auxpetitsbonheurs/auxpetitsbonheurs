// S-318 AC3: the cost an admin types (whole rupees, 0..1,000,000, empty clears).
import { describe, expect, test } from "vitest";
import { COST_MAX_RS, parseCostRs } from "./cost";

describe("parseCostRs (S-318 AC3)", () => {
  test("empty or spaces clears the cost", () => {
    expect(parseCostRs("")).toEqual({ ok: true, costRs: null });
    expect(parseCostRs("   ")).toEqual({ ok: true, costRs: null });
  });

  test("whole rupees from 0 to 1,000,000, thousands separators allowed", () => {
    expect(parseCostRs("0")).toEqual({ ok: true, costRs: 0 });
    expect(parseCostRs(" 650 ")).toEqual({ ok: true, costRs: 650 });
    expect(parseCostRs("1,500")).toEqual({ ok: true, costRs: 1500 });
    expect(parseCostRs("1 500")).toEqual({ ok: true, costRs: 1500 });
    expect(parseCostRs("1000000")).toEqual({ ok: true, costRs: COST_MAX_RS });
  });

  test("refuses decimals, negatives, letters and more than 1,000,000", () => {
    for (const text of ["12.5", "-1", "+5", "abc", "1e3", "1000001", "99999999", "Rs 500"]) {
      expect(parseCostRs(text), text).toEqual({ ok: false });
    }
  });
});
