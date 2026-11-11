// Stale-item detection (ADR-0004): basket lines priced from the cached menu, price notes,
// unavailable lines left out of the total.
import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { menu, menuProduct } from "./testing/menu";
import { type MenuEntry, fresherEntry, isMenuEntry, menuWithServerPrices, mergePriceNotes, orderableItemCount, priceBasket, priceChanges } from "./menu";
import { checkoutTotals } from "./pricing";

const CAKE = "11111111-1111-4111-8111-111111111111";
const TART = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

const line = (lineId: string, productId: string, quantity = 1): BasketLine => ({ lineId, productId, options: [], quantity });

describe("priceBasket", () => {
  test("prices lines from the menu; sold out and missing products are problems left out of the total", () => {
    const priced = priceBasket([line("a", CAKE, 2), line("b", TART), line("c", GONE)], menu([menuProduct(CAKE, 850), menuProduct(TART, 400, { status: "sold_out" })]));

    expect(priced.map((l) => [l.lineId, l.lineTotalRs, l.problem])).toEqual([["a", 1700, null], ["b", 400, "sold_out"], ["c", 0, "hidden"]]);
    expect(checkoutTotals(priced, "delivery", 200)).toEqual({ itemsTotalRs: 1700, deliveryFeeRs: 200, totalRs: 1900 });
  });
});

describe("price notes", () => {
  test("a changed price is a note from the old to the new price", () => {
    const changes = priceChanges(menu([menuProduct(CAKE, 700), menuProduct(TART, 400)]), menu([menuProduct(CAKE, 850), menuProduct(TART, 400)]));
    expect([...changes]).toEqual([[CAKE, { fromRs: 700, toRs: 850 }]]);
  });

  test("notes keep the first price, follow the latest, and vanish when the price returns", () => {
    let notes = mergePriceNotes(new Map(), new Map([[CAKE, { fromRs: 700, toRs: 850 }]]));
    notes = mergePriceNotes(notes, new Map([[CAKE, { fromRs: 850, toRs: 900 }]]));
    expect(notes.get(CAKE)).toEqual({ fromRs: 700, toRs: 900 });
    notes = mergePriceNotes(notes, new Map([[CAKE, { fromRs: 900, toRs: 700 }]]));
    expect(notes.has(CAKE)).toBe(false);
  });
});

describe("menu entries", () => {
  const entry = (v: string, generatedAt: number): MenuEntry => ({ v, data: menu([menuProduct(CAKE, 850)], generatedAt) });

  test("the newer copy wins; a tie keeps the first", () => {
    expect(fresherEntry(entry("a", 1), entry("b", 2)).v).toBe("b");
    expect(fresherEntry(entry("a", 2), entry("b", 2)).v).toBe("a");
    expect(fresherEntry(null, entry("b", 2)).v).toBe("b");
  });

  test("shape check rejects junk", () => {
    expect(isMenuEntry(entry("a", 1))).toBe(true);
    expect(isMenuEntry({ v: "a", data: { products: [{}] } })).toBe(false);
    expect(isMenuEntry(null)).toBe(false);
  });

  test("a PRICE_CHANGED refusal updates prices, marks sold out, drops hidden and sets the fee", () => {
    const base: MenuEntry = { v: "v1", data: menu([menuProduct(CAKE, 700), menuProduct(TART, 400), menuProduct(GONE, 100)]) };
    const next = menuWithServerPrices(base, [
      { productId: CAKE, unitPriceRs: 850, problem: null },
      { productId: TART, unitPriceRs: 400, problem: "sold_out" },
      { productId: GONE, unitPriceRs: 0, problem: "hidden" },
    ], 250);

    expect(next.v).not.toBe("v1");
    expect(next.data.products.map((p) => [p.id, p.basePriceRs, p.status])).toEqual([[CAKE, 850, "available"], [TART, 400, "sold_out"]]);
    expect(next.data.checkout.deliveryFeeRs).toBe(250);
  });
});

describe("orderableItemCount (header badge, UX audit H1.4 / M1)", () => {
  const lines = [line("a", CAKE, 2), line("b", TART), line("c", GONE, 3)];

  test("counts only what will be ordered: sold out and known-gone products are left out", () => {
    const cached = menu([menuProduct(CAKE, 850), menuProduct(TART, 400, { status: "sold_out" })]);

    expect(orderableItemCount(lines, cached, new Set([GONE]))).toBe(2);
  });

  test("a product the cached menu does not know yet still counts (a new cake must never look unadded)", () => {
    expect(orderableItemCount(lines, menu([menuProduct(CAKE, 850)]), new Set())).toBe(6);
  });

  test("without a cached menu every line counts", () => {
    expect(orderableItemCount(lines, null, new Set())).toBe(6);
  });
});
