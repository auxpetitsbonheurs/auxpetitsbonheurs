// S-082 AC7 (FR-017): property tests (fast-check). The best promotion is the lowest price,
// then the earlier start, then the lower id, whatever order the promotions come in; it never
// stacks (the sale price is always one discount's own price) and never reaches the base price.
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { type PromotionRule, bestPromotion, salePriceRs } from "./promotions";

const NOW = new Date("2026-11-12T08:00:00.000Z");
const HOUR = 3_600_000;

const discountArb = fc.oneof(
  fc.record({ kind: fc.constant("percent" as const), percentOff: fc.integer({ min: 0, max: 100 }), salePriceRs: fc.constant(null) }),
  fc.record({ kind: fc.constant("sale_price" as const), percentOff: fc.constant(null), salePriceRs: fc.integer({ min: 0, max: 6_000 }) }),
);

const promotionsArb = fc.uniqueArray(
  fc.record({
    id: fc.stringMatching(/^[0-9a-f]{4}$/),
    start: fc.integer({ min: -5, max: 2 }),
    length: fc.integer({ min: -1, max: 6 }),
    active: fc.boolean(),
    covers: fc.boolean(),
    discount: discountArb,
  }),
  { selector: (p) => p.id, maxLength: 8 },
);

const toRules = (specs: { id: string; start: number; length: number; active: boolean; covers: boolean; discount: Parameters<typeof salePriceRs>[1] }[]): PromotionRule[] =>
  specs.map((s) => ({
    id: s.id,
    startsAt: new Date(NOW.getTime() + s.start * HOUR),
    endsAt: new Date(NOW.getTime() + (s.start + s.length) * HOUR),
    active: s.active,
    placement: "card",
    discounts: [{ productId: s.covers ? "cake" : "tart", ...s.discount }],
  }));

describe("bestPromotion properties (AC7)", () => {
  test("any permutation of the promotions gives the same answer", () => {
    fc.assert(
      fc.property(promotionsArb, fc.integer({ min: 0, max: 5_000 }), fc.nat(), (specs, base, seed) => {
        const rules = toRules(specs);
        const shuffled = [...rules].sort((a, b) => ((a.id.charCodeAt(0) * 31 + seed) % 7) - ((b.id.charCodeAt(0) * 31 + seed) % 7) || (a.id < b.id ? 1 : -1));
        expect(bestPromotion("cake", base, shuffled, NOW)).toEqual(bestPromotion("cake", base, rules, NOW));
        expect(bestPromotion("cake", base, [...rules].reverse(), NOW)).toEqual(bestPromotion("cake", base, rules, NOW));
      }),
    );
  });

  test("the winner is one live discount's own price, below base and no higher than any other live offer", () => {
    fc.assert(
      fc.property(promotionsArb, fc.integer({ min: 0, max: 5_000 }), (specs, base) => {
        const rules = toRules(specs);
        const best = bestPromotion("cake", base, rules, NOW);
        const live = rules.filter((r) => r.active && (r.startsAt as Date) <= NOW && NOW < (r.endsAt as Date) && r.discounts![0]!.productId === "cake");
        const prices = live.flatMap((r) => {
          const sale = salePriceRs(base, r.discounts![0]!);
          return sale === null ? [] : [sale];
        });
        if (prices.length === 0) {
          expect(best).toBeNull();
          return;
        }
        expect(best!.salePriceRs).toBe(Math.min(...prices));
        expect(best!.salePriceRs).toBeLessThan(base);
        expect(live.some((r) => r.id === best!.promotionId)).toBe(true);
      }),
    );
  });
});
