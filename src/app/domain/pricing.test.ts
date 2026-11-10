import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { type PricingProduct, checkoutTotals, deliveryFeeFor, priceLines, productProblem } from "./pricing";

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
