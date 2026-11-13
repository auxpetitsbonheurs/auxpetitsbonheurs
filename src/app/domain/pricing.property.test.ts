// S-081 AC11: property tests (fast-check). For any basket, total = sum of orderable line
// totals + fee, and a priced line is never negative.
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { type LineInput, type ProductPricing, priceBasket } from "./pricing";

const product = (id: string, basePriceRs: number, deltas: number[], status: ProductPricing["status"]): ProductPricing => ({
  id,
  name: { en: id, fr: null },
  basePriceRs,
  status,
  optionGroups: [{ id: "g", name: { en: "Size", fr: null }, kind: "single", required: true, textMaxLength: null, quantityMin: null, quantityMax: null, choices: deltas.map((d, i) => ({ id: `c${i}`, name: { en: `c${i}`, fr: null }, priceDeltaRs: d })) }],
});

const catalogueArb = fc.array(
  fc.record({ base: fc.integer({ min: 0, max: 20_000 }), deltas: fc.array(fc.integer({ min: -2_000, max: 5_000 }), { minLength: 1, maxLength: 4 }), status: fc.constantFrom("available", "available", "sold_out", "hidden") }),
  { minLength: 1, maxLength: 6 },
);

describe("priceBasket properties (AC11)", () => {
  test("total == sum(lineTotal of orderable lines) + fee, and no line total is negative", () => {
    fc.assert(
      fc.property(
        catalogueArb,
        fc.array(fc.record({ p: fc.nat(), c: fc.nat(), q: fc.integer({ min: 1, max: 50 }) }), { maxLength: 10 }),
        fc.constantFrom("delivery" as const, "pickup" as const),
        fc.integer({ min: 0, max: 1_000 }),
        (specs, picks, fulfilment, fee) => {
          const products = specs.map((s, i) => product(`p${i}`, s.base, s.deltas, s.status as ProductPricing["status"]));
          const catalogue = new Map(products.map((p) => [p.id, p]));
          const lines: LineInput[] = picks.map((pick, i) => {
            const target = products[pick.p % products.length]!;
            const choices = target.optionGroups![0]!.choices;
            return { lineId: `l${i}`, productId: target.id, options: [{ groupId: "g", choiceIds: [choices[pick.c % choices.length]!.id] }], quantity: pick.q };
          });
          const basket = priceBasket(lines, catalogue, { fulfilment, deliveryFeeRs: fee, limits: { cakeMessageMax: 40 } });
          const sum = basket.lines.filter((l) => l.problem === null).reduce((total, l) => total + l.lineTotalRs, 0);
          expect(basket.totalRs).toBe(sum + (fulfilment === "delivery" ? fee : 0));
          expect(basket.lines.every((l) => l.problem !== null || l.lineTotalRs >= 0)).toBe(true);
        },
      ),
    );
  });
});
