// S-122 AC3, AC4 (totals) and S-123 AC2-AC5, AC7 (what changed, and the email rule).
import { describe, expect, test } from "vitest";
import { type EditSnapshot, editChange, editTotals, needsUpdatedEmail, storedOption } from "./order-edit";

const BEFORE: EditSnapshot = {
  fulfilOn: "2026-12-14",
  windowId: "am",
  fulfilment: "delivery",
  address: "12 Royal Road",
  landmark: null,
  deliveryFeeRs: 200,
  contactName: "Marie",
  contactPhone: "+23057123456",
  contactEmail: "marie@example.com",
  customerNote: null,
  totalRs: 1050,
  totalOverridden: false,
  items: ["1 × Chocolate cake"],
};

describe("editTotals (S-122 AC3, AC4)", () => {
  test("items + fee; pickup has no fee", () => {
    expect(editTotals([850, 400], "delivery", 200, null)).toEqual({ itemsTotalRs: 1250, deliveryFeeRs: 200, totalRs: 1450, totalOverridden: false });
    expect(editTotals([850], "pickup", 200, null)).toEqual({ itemsTotalRs: 850, deliveryFeeRs: 0, totalRs: 850, totalOverridden: false });
  });

  test("a total set by hand wins and is flagged", () => {
    expect(editTotals([850, 850], "delivery", 200, 5000)).toEqual({ itemsTotalRs: 1700, deliveryFeeRs: 200, totalRs: 5000, totalOverridden: true });
  });
});

describe("editChange and the email rule (S-123)", () => {
  test("a new date: one email with the date (AC2)", () => {
    const change = editChange(BEFORE, { ...BEFORE, fulfilOn: "2026-12-15" });
    expect(change).toMatchObject({ dateChanged: true, totalChanged: false, diff: { fulfilOn: { from: "2026-12-14", to: "2026-12-15" } } });
    expect(needsUpdatedEmail(change, BEFORE.contactEmail)).toBe(true);
  });

  test("a new total, including setting it by hand, is one email; date and total together still one (AC3)", () => {
    const both = editChange(BEFORE, { ...BEFORE, fulfilOn: "2026-12-15", totalRs: 5000, totalOverridden: true });
    expect(both).toMatchObject({ dateChanged: true, totalChanged: true, oldTotalRs: 1050, newTotalRs: 5000, diff: { totalOverridden: { from: false, to: true } } });
    expect(needsUpdatedEmail(both, BEFORE.contactEmail)).toBe(true);
  });

  test("notes, window or a same-total item change: no email (AC4)", () => {
    const change = editChange(BEFORE, { ...BEFORE, windowId: "pm", customerNote: "Ring twice", items: ["1 × Lemon tart"] });
    expect(change.diff).toHaveProperty("windowId");
    expect(change.diff).toHaveProperty("items");
    expect(needsUpdatedEmail(change, BEFORE.contactEmail)).toBe(false);
  });

  test("no email address: never (AC5)", () => {
    expect(needsUpdatedEmail(editChange(BEFORE, { ...BEFORE, totalRs: 2000 }), null)).toBe(false);
  });
});

describe("storedOption", () => {
  test("a choice keeps its group, choice and delta; a text keeps its text", () => {
    expect(storedOption({ groupId: "g", group: { en: "Size", fr: null }, kind: "single", choiceId: "c", label: { en: "Large", fr: null }, priceDeltaRs: 300 })).toEqual({
      groupId: "g",
      group: { en: "Size" },
      kind: "single",
      choiceId: "c",
      choice: { en: "Large" },
      priceDeltaRs: 300,
    });
    expect(storedOption({ groupId: "g", group: { en: "Message", fr: null }, kind: "text", choiceId: null, label: { en: "Message", fr: null }, priceDeltaRs: 0, text: "Hi" })).toMatchObject({ kind: "text", text: "Hi" });
  });
});
