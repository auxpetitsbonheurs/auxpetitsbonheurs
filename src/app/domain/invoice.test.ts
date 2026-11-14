// S-127 invoice rules: totals, rows before promotions, dates and the file name.
import { describe, expect, test } from "vitest";
import { formatRupeeAmount, formatRupees } from "~/lib/locale";
import {
  BANK_ACCOUNT_PATTERN,
  BRN_PATTERN,
  eventDateParts,
  eventDateText,
  formatInvoiceDate,
  invoiceFileName,
  invoiceRows,
  invoiceTotals,
  ordinalSuffix,
  textLines,
} from "./invoice";

const line = (totalRs: number, quantity: number | null = 1) => ({ quantity, description: "Cake", details: [], unitRs: totalRs, totalRs });

describe("invoiceTotals (S-127 AC totals)", () => {
  test("unpaid: subtotal is the rows, nothing paid, the whole total is due", () => {
    expect(invoiceTotals({ lines: [line(5200), line(150, null)], discountRs: 0, totalRs: 5350, paid: false })).toEqual({
      subtotalRs: 5350,
      discountRs: 0,
      adjustmentRs: 0,
      totalRs: 5350,
      paidRs: 0,
      dueRs: 5350,
    });
  });

  test("paid in full (no deposit): downpayment is the total and the balance is 0", () => {
    const totals = invoiceTotals({ lines: [line(1200)], discountRs: 0, totalRs: 1200, paid: true });
    expect(totals.paidRs).toBe(1200);
    expect(totals.dueRs).toBe(0);
  });

  test("a promotion shows as savings and the rows still add up to the total", () => {
    const totals = invoiceTotals({ lines: [line(1000), line(200, null)], discountRs: 100, totalRs: 1100, paid: false });
    expect(totals).toMatchObject({ subtotalRs: 1200, discountRs: 100, adjustmentRs: 0, dueRs: 1100 });
  });

  test("a total set by hand shows the difference as an adjustment", () => {
    const totals = invoiceTotals({ lines: [line(1000)], discountRs: 0, totalRs: 900, paid: false });
    expect(totals.adjustmentRs).toBe(-100);
    expect(totals.subtotalRs - totals.discountRs + totals.adjustmentRs).toBe(totals.totalRs);
  });
});

describe("invoiceRows", () => {
  test("rows carry the price before the promotion; the savings are summed once", () => {
    const { rows, discountRs } = invoiceRows([
      { name: "Lemon tart", details: ["8 inch"], quantity: 2, originalBasePriceRs: 600, unitBasePriceRs: 500, lineTotalRs: 1100 },
      { name: "Cookies", details: [], quantity: 1, originalBasePriceRs: 300, unitBasePriceRs: 300, lineTotalRs: 300 },
    ]);
    expect(discountRs).toBe(200);
    expect(rows[0]).toEqual({ quantity: 2, description: "Lemon tart", details: ["8 inch"], unitRs: 650, totalRs: 1300 });
    expect(rows[1]?.totalRs).toBe(300);
  });

  test("a sale price above the base never makes a negative saving", () => {
    expect(invoiceRows([{ name: "X", details: [], quantity: 1, originalBasePriceRs: 100, unitBasePriceRs: 120, lineTotalRs: 120 }]).discountRs).toBe(0);
  });
});

describe("dates", () => {
  test("invoice date reads dd/mm/yyyy", () => {
    expect(formatInvoiceDate("2026-11-05")).toBe("05/11/2026");
  });

  test.each([
    [1, "st"],
    [2, "nd"],
    [3, "rd"],
    [4, "th"],
    [11, "th"],
    [12, "th"],
    [13, "th"],
    [21, "st"],
    [22, "nd"],
    [23, "rd"],
    [31, "st"],
  ])("ordinal of %i is %s", (day, suffix) => {
    expect(ordinalSuffix(day)).toBe(suffix);
  });

  test("event date: 5th November 2026 in English, 5 novembre 2026 and 1er décembre in French", () => {
    expect(eventDateText(eventDateParts("2026-11-05", "en"))).toBe("5th November 2026");
    expect(eventDateParts("2026-11-05", "en")).toEqual({ day: "5", suffix: "th", rest: "November 2026" });
    expect(eventDateText(eventDateParts("2026-11-05", "fr"))).toBe("5 novembre 2026");
    expect(eventDateText(eventDateParts("2026-12-01", "fr"))).toBe("1er décembre 2026");
  });
});

describe("formatting", () => {
  test("file name is Invoice-<number>.pdf", () => {
    expect(invoiceFileName(1108)).toBe("Invoice-1108.pdf");
  });

  test("amounts use the site's Rs grouping", () => {
    expect(formatRupeeAmount(5350)).toBe("5,350");
    expect(formatRupees(5350)).toBe(`Rs ${formatRupeeAmount(5350)}`);
  });

  test("text lines drop blanks and trim", () => {
    expect(textLines("  Line 1\r\n\n Line 2 ")).toEqual(["Line 1", "Line 2"]);
    expect(textLines(null)).toEqual([]);
  });

  test("bank account: digits and single spaces only", () => {
    expect(BANK_ACCOUNT_PATTERN.test("000000000000")).toBe(true);
    expect(BANK_ACCOUNT_PATTERN.test("000 000 000 000")).toBe(true);
    expect(BANK_ACCOUNT_PATTERN.test("000  000")).toBe(false);
    expect(BANK_ACCOUNT_PATTERN.test("12-34-5678")).toBe(false);
    expect(BANK_ACCOUNT_PATTERN.test("12345")).toBe(false);
    expect(BANK_ACCOUNT_PATTERN.test("000 ")).toBe(false);
  });

  test("BRN: letters and digits", () => {
    expect(BRN_PATTERN.test("C00000000")).toBe(true);
    expect(BRN_PATTERN.test("C0 0000")).toBe(false);
  });
});
