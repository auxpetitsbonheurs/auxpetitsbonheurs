// Stale-item detection (ADR-0004): basket lines priced from the cached menu, price notes,
// unavailable lines left out of the total.
import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { menu, menuProduct } from "./testing/menu";
import { type MenuEntry, type MenuOptionGroup, fresherEntry, isMenuEntry, mergePriceNotes, orderableItemCount, priceChanges } from "./menu";
import { linePriceNote, priceBasketFromMenu } from "./menu-pricing";
import { menuWithServerPrices } from "./menu-refusal";
import { checkoutTotals } from "./pricing";

const CAKE = "11111111-1111-4111-8111-111111111111";
const TART = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";

const line = (lineId: string, productId: string, quantity = 1): BasketLine => ({ lineId, productId, options: [], quantity });

describe("priceBasketFromMenu", () => {
  test("prices lines from the menu; sold out and missing products are problems left out of the total", () => {
    const priced = priceBasketFromMenu([line("a", CAKE, 2), line("b", TART), line("c", GONE)], menu([menuProduct(CAKE, 850), menuProduct(TART, 400, { status: "sold_out" })]));

    expect(priced.map((l) => [l.lineId, l.lineTotalRs, l.problem])).toEqual([["a", 1700, null], ["b", 400, "sold_out"], ["c", 0, "hidden"]]);
    expect(checkoutTotals(priced, "delivery", 200)).toEqual({ itemsTotalRs: 1700, deliveryFeeRs: 200, totalRs: 1900 });
  });
});

const SIZE: MenuOptionGroup = {
  id: "44444444-4444-4444-8444-444444444444",
  name: { en: "Size", fr: "Taille" },
  kind: "single",
  required: true,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: [
    { id: "55555555-5555-4555-8555-555555555555", name: { en: "6 inch", fr: null }, priceDeltaRs: 0 },
    { id: "66666666-6666-4666-8666-666666666666", name: { en: "8 inch", fr: null }, priceDeltaRs: 600 },
  ],
};
const EIGHT = SIZE.choices[1]!.id;
const sized = (deltaRs: number, base = 1000) => menuProduct(CAKE, base, { optionGroups: [{ ...SIZE, choices: [SIZE.choices[0]!, { ...SIZE.choices[1]!, priceDeltaRs: deltaRs }] }] });
const eightInch: BasketLine = { lineId: "a", productId: CAKE, options: [{ groupId: SIZE.id, choiceIds: [EIGHT] }], quantity: 1 };

describe("priceBasketFromMenu and seasons (S-084 AC7)", () => {
  test("a line whose season ended today is out_of_season and left out; inside its window it is priced", () => {
    const xmas = menuProduct(CAKE, 900, { season: { startsOn: "2026-12-01", endsOn: "2026-12-25" } });
    const cached = { ...menu([xmas, menuProduct(TART, 400)]), today: "2026-12-26" };

    expect(priceBasketFromMenu([line("a", CAKE), line("b", TART)], cached).map((l) => l.problem)).toEqual(["out_of_season", null]);
    expect(priceBasketFromMenu([line("a", CAKE)], cached, "2026-12-25")[0]?.problem).toBeNull();
  });
});

describe("priceBasketFromMenu with options (S-066 AC2)", () => {
  test("a line is priced with its chosen size; an unknown choice is options_changed and left out", () => {
    const cached = menu([sized(600)]);
    const unknown: BasketLine = { ...eightInch, lineId: "b", options: [{ groupId: SIZE.id, choiceIds: [GONE] }] };
    const priced = priceBasketFromMenu([eightInch, unknown], cached);

    expect(priced.map((l) => [l.unitPriceRs, l.problem])).toEqual([[1600, null], [1000, "options_changed"]]);
    expect(checkoutTotals(priced, null, 0).itemsTotalRs).toBe(1600);
  });
});

describe("price notes", () => {
  test("a changed base or option price keeps the product's earlier copy", () => {
    const changes = priceChanges(menu([sized(600), menuProduct(TART, 400)]), menu([sized(700), menuProduct(TART, 400)]));
    expect([...changes.keys()]).toEqual([CAKE]);
    expect(changes.get(CAKE)?.before.optionGroups[0]?.choices[1]?.priceDeltaRs).toBe(600);
  });

  test("the line note compares the line's own unit price before and now", () => {
    const note = priceChanges(menu([sized(600)]), menu([sized(700)])).get(CAKE);
    const now = sized(700);
    expect(linePriceNote(eightInch, note, now)).toEqual({ fromRs: 1600, toRs: 1700 });
    const sixInch = { ...eightInch, options: [{ groupId: SIZE.id, choiceIds: [SIZE.choices[0]!.id] }] };
    expect(linePriceNote(sixInch, note, now)).toBeNull();
  });

  test("notes keep the first copy, follow the latest, and vanish when the prices return", () => {
    const first = menu([sized(600)]);
    const second = menu([sized(700)]);
    const third = menu([sized(800)]);
    let notes = mergePriceNotes(new Map(), priceChanges(first, second), second);
    notes = mergePriceNotes(notes, priceChanges(second, third), third);
    expect(notes.get(CAKE)?.before.optionGroups[0]?.choices[1]?.priceDeltaRs).toBe(600);
    notes = mergePriceNotes(notes, priceChanges(third, first), first);
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

  test("a refused line with options sets the base and the chosen option's server price", () => {
    const base: MenuEntry = { v: "v1", data: menu([sized(600)]) };
    const next = menuWithServerPrices(base, [{ productId: CAKE, unitPriceRs: 1800, problem: null, options: [{ choiceId: EIGHT, priceDeltaRs: 700 }] }], undefined);

    expect(next.data.products[0]?.basePriceRs).toBe(1100);
    expect(next.data.products[0]?.optionGroups[0]?.choices[1]?.priceDeltaRs).toBe(700);
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

describe("promotions in the cached menu (S-082, ADR-0004 stale prices)", () => {
  const END = Date.parse("2026-11-12T14:00:00.000Z");
  const PROMO = "77777777-7777-4777-8777-777777777777";
  const onSale = (extra = {}) => ({ ...sized(600), promos: [{ id: PROMO, salePriceRs: 800, endsAt: END }], ...extra });

  test("a live promotion replaces the base price (options unchanged) until its end instant, then the full price", () => {
    const cached = menu([onSale()]);
    expect(priceBasketFromMenu([eightInch], cached, cached.today, END - 1)[0]).toMatchObject({ unitPriceRs: 1400, originalUnitPriceRs: 1600, promotionId: PROMO });
    expect(priceBasketFromMenu([eightInch], cached, cached.today, END)[0]).toMatchObject({ unitPriceRs: 1600, promotionId: null });
  });

  test("the next ranked promotion takes over when the best one ends first", () => {
    const later = "88888888-8888-4888-8888-888888888888";
    const cached = menu([{ ...sized(600), promos: [{ id: PROMO, salePriceRs: 700, endsAt: END }, { id: later, salePriceRs: 900, endsAt: END + 3_600_000 }] }]);
    expect(priceBasketFromMenu([eightInch], cached, cached.today, END)[0]).toMatchObject({ unitPriceRs: 1500, promotionId: later });
  });

  test("a sold-out product's promotion has no effect (S-082 AC11)", () => {
    const cached = menu([onSale({ status: "sold_out" as const })]);
    expect(priceBasketFromMenu([eightInch], cached, cached.today, END - 1)[0]).toMatchObject({ problem: "sold_out", promotionId: null });
  });

  test("a promotion that ended between two menu copies gives the calm note from the sale price to the full price", () => {
    const before = menu([onSale()]);
    const after = menu([sized(600)]);
    const note = priceChanges(before, after).get(CAKE);
    expect(note).toBeDefined();
    expect(linePriceNote(eightInch, note, after.products[0], END)).toEqual({ fromRs: 1400, toRs: 1600 });
  });

  test("a PRICE_CHANGED refusal with a promotion keeps the sale once (never applied twice); without one, no sale is shown", () => {
    const base: MenuEntry = { v: "m-1", data: menu([sized(600)]) };
    const withPromo = menuWithServerPrices(base, [{ productId: CAKE, unitPriceRs: 1400, originalUnitPriceRs: 1600, promotionId: PROMO, problem: null, options: [{ choiceId: EIGHT, priceDeltaRs: 600 }] }], undefined);
    expect(priceBasketFromMenu([eightInch], withPromo.data, withPromo.data.today, END)[0]).toMatchObject({ unitPriceRs: 1400, originalUnitPriceRs: 1600, promotionId: PROMO });
    const ended: MenuEntry = { v: "m-2", data: menu([onSale()]) };
    const noPromo = menuWithServerPrices(ended, [{ productId: CAKE, unitPriceRs: 1600, originalUnitPriceRs: 1600, promotionId: null, problem: null, options: [{ choiceId: EIGHT, priceDeltaRs: 600 }] }], undefined);
    expect(priceBasketFromMenu([eightInch], noPromo.data, noPromo.data.today, END - 1)[0]).toMatchObject({ unitPriceRs: 1600, promotionId: null });
  });
});
