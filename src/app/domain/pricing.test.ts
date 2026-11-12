import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { type PricedOptionGroup, type PricingProduct, checkoutTotals, deliveryFeeFor, lowestOptionPrice, optionsCanGoBelowZero, priceLines, productProblem, textOptionProblem } from "./pricing";

const CAKE: PricingProduct = { id: "p1", status: "available", name: { en: "Chocolate cake", fr: "Gâteau au chocolat" }, basePriceRs: 850 };
const TART: PricingProduct = { id: "p2", status: "sold_out", name: { en: "Lemon tart", fr: null }, basePriceRs: 400 };
const line = (lineId: string, productId: string, quantity: number): BasketLine => ({ lineId, productId, options: [], quantity });
const products = new Map([CAKE, TART].map((p) => [p.id, p]));

describe("productProblem", () => {
  test("available is orderable; sold out, hidden and missing are not", () => {
    expect(productProblem(CAKE)).toBeNull();
    expect(productProblem(TART)).toBe("sold_out");
    expect(productProblem({ status: "hidden" })).toBe("hidden");
    expect(productProblem(undefined)).toBe("hidden");
  });
});

describe("priceLines (S-012 AC1)", () => {
  test("prices each line at the server's base price times quantity", () => {
    const [priced] = priceLines([line("a", "p1", 2)], products);

    expect(priced).toMatchObject({
      lineId: "a",
      productId: "p1",
      name: CAKE.name,
      quantity: 2,
      unitPriceRs: 850,
      originalUnitPriceRs: 850,
      lineTotalRs: 1700,
      promotionId: null,
      problem: null,
    });
  });

  test("flags lines whose product cannot be ordered", () => {
    const priced = priceLines([line("a", "p2", 1), line("b", "gone", 1)], products);

    expect(priced.map((p) => p.problem)).toEqual(["sold_out", "hidden"]);
  });
});

describe("delivery fee rule (S-012 AC5, AC6)", () => {
  test("delivery adds the Settings fee; pickup and no choice add nothing", () => {
    expect(deliveryFeeFor("delivery", 200)).toBe(200);
    expect(deliveryFeeFor("pickup", 200)).toBe(0);
    expect(deliveryFeeFor(null, 200)).toBe(0);
  });

  test("switching from delivery to pickup removes the fee from the total", () => {
    const priced = priceLines([line("a", "p1", 1)], products);

    expect(checkoutTotals(priced, "delivery", 200)).toEqual({ itemsTotalRs: 850, deliveryFeeRs: 200, totalRs: 1050 });
    expect(checkoutTotals(priced, "pickup", 200)).toEqual({ itemsTotalRs: 850, deliveryFeeRs: 0, totalRs: 850 });
  });

  test("lines that cannot be ordered do not count towards the totals", () => {
    const priced = priceLines([line("a", "p1", 1), line("b", "p2", 3)], products);

    expect(checkoutTotals(priced, "pickup", 200).itemsTotalRs).toBe(850);
  });
});

describe("options below Rs 0 (S-048 AC7)", () => {
  const size = (deltas: number[], required = true): PricedOptionGroup => ({ kind: "single", required, choices: deltas.map((priceDeltaRs) => ({ priceDeltaRs })) });

  test("base Rs 500 with a choice of minus Rs 600 warns", () => {
    expect(optionsCanGoBelowZero(500, [size([0, -600])])).toBe(true);
    expect(lowestOptionPrice(500, [size([0, -600])])).toBe(-100);
  });

  test("a Rs 0 choice keeps the base price; positive sizes never warn", () => {
    expect(lowestOptionPrice(1200, [size([0, 300, 600])])).toBe(1200);
    expect(optionsCanGoBelowZero(1200, [size([0, 300, 600])])).toBe(false);
  });

  test("an optional pick-one group can be skipped, so only negative choices count", () => {
    expect(lowestOptionPrice(500, [size([100, 200], false)])).toBe(500);
  });

  test("pick several adds every negative choice; text groups never change the price", () => {
    const addons: PricedOptionGroup = { kind: "multiple", required: false, choices: [{ priceDeltaRs: -300 }, { priceDeltaRs: -250 }, { priceDeltaRs: 100 }] };
    const message: PricedOptionGroup = { kind: "text", required: true, choices: [] };

    expect(lowestOptionPrice(500, [addons, message])).toBe(-50);
  });

  test("a quantity group counts the cheapest choice up to its maximum", () => {
    const box: PricedOptionGroup = { kind: "quantity", required: true, quantityMin: 0, quantityMax: 6, choices: [{ priceDeltaRs: -100 }, { priceDeltaRs: 0 }] };

    expect(lowestOptionPrice(500, [box])).toBe(-100);
  });
});

describe("text option length (S-048 AC8, FR-008)", () => {
  test("a group with max 25 refuses 26 characters and takes 25", () => {
    const group = { required: false, textMaxLength: 25 };

    expect(textOptionProblem("a".repeat(26), group, 40)).toBe("too_long");
    expect(textOptionProblem("a".repeat(25), group, 40)).toBeNull();
  });

  test("a blank max uses the Settings value", () => {
    const group = { required: false, textMaxLength: null };

    expect(textOptionProblem("a".repeat(40), group, 40)).toBeNull();
    expect(textOptionProblem("a".repeat(41), group, 40)).toBe("too_long");
  });

  test("counts characters, not bytes (accents and emoji count once)", () => {
    expect(textOptionProblem("Joyeux anniversaire Zoé 🎂", { required: false, textMaxLength: 25 }, 40)).toBeNull();
  });

  test("blank is refused only when the group is required", () => {
    expect(textOptionProblem("  ", { required: true, textMaxLength: null }, 40)).toBe("missing");
    expect(textOptionProblem(undefined, { required: false, textMaxLength: null }, 40)).toBeNull();
  });
});
