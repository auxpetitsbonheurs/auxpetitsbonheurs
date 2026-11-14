// The order form's payload and live total (S-122 AC1, AC10): what the screen shows is what the
// server stores.
import { describe, expect, test } from "vitest";
import type { Menu } from "~/domain/menu";
import { type OrderFormState, formPayload, liveTotals } from "./model";

const MENU = {
  products: [{ id: "p1", slug: "tart", type: "tart", name: { en: "Lemon tart", fr: null }, basePriceRs: 400, status: "available", minQuantity: null, photos: [], optionGroups: [] }],
  checkout: { deliveryFeeRs: 200 },
  today: "2026-11-05",
  limits: { cakeMessageMax: 40 },
  generatedAt: 0,
} as unknown as Menu;

const STATE: OrderFormState = {
  lines: [
    { key: "k", kind: "kept", itemId: "i1", name: { en: "Chocolate cake", fr: null }, unitRs: 850, quantity: 2, details: [] },
    { key: "f", kind: "free", name: "Gift box", priceRs: 150, quantity: 1 },
    { key: "c", kind: "catalogue", productId: "p1", name: { en: "Lemon tart", fr: null }, options: [], quantity: 1, details: [] },
  ],
  fulfilment: { fulfilment: "delivery", date: "2026-11-12", windowId: "am", address: "12 Royal Road", landmark: "", deliveryFeeRs: 200 },
  contact: { name: "Aisha", phone: "5712 3456", email: "", note: "" },
  overrideTotalRs: null,
};

describe("order form model", () => {
  test("the live total adds kept, free-text and catalogue lines and the fee", () => {
    expect(liveTotals(STATE, MENU, 0)).toEqual({ itemsTotalRs: 2250, deliveryFeeRs: 200, totalRs: 2450, totalOverridden: false });
  });

  test("pickup drops the fee and the address from the payload", () => {
    const payload = formPayload({ ...STATE, fulfilment: { ...STATE.fulfilment, fulfilment: "pickup" } });
    expect(payload).toMatchObject({ fulfilment: "pickup", deliveryFeeRs: 0 });
    expect(payload).not.toHaveProperty("address");
  });

  test("lines become the contract's shapes", () => {
    expect(formPayload(STATE).lines).toEqual([
      { itemId: "i1", quantity: 2 },
      { freeText: { name: "Gift box", priceRs: 150, quantity: 1 } },
      { lineId: "c", productId: "p1", options: [], quantity: 1 },
    ]);
  });
});
