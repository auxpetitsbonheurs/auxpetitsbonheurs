// S-019 AC7 (NFR-001): sanity guard against accidentally heavy domain code on the order
// path. Pure pricing (with a required size and a cake message, S-081) + number + token for a
// 10-line basket must stay well under 1 ms per call on the CI runner. Not a platform CPU
// measurement (that is docs/runbooks/worker-cpu.md).
import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { formatOrderNumber, newTrackingToken } from "./order-number";
import { type AvailabilityCtx, dayStatuses } from "./availability";
import { type ProductPricing, priceBasket } from "./pricing";
import { type PromotionRule, bestPromotion } from "./promotions";

const size = {
  id: "size",
  name: { en: "Size", fr: "Taille" },
  kind: "single",
  required: true,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: [
    { id: "s6", name: { en: "6 inch", fr: null }, priceDeltaRs: 0 },
    { id: "s8", name: { en: "8 inch", fr: null }, priceDeltaRs: 600 },
  ],
};
const products = new Map<string, ProductPricing>(
  Array.from({ length: 10 }, (_, i) => [`p${i}`, { id: `p${i}`, name: { en: `Cake ${i}`, fr: `Gâteau ${i}` }, basePriceRs: 500 + i * 50, status: "available" as const, optionGroups: [size] }]),
);
const lines: BasketLine[] = Array.from({ length: 10 }, (_, i) => ({
  lineId: `l${i}`,
  productId: `p${i}`,
  options: [{ groupId: "size", choiceIds: [i % 2 ? "s8" : "s6"] }],
  cakeMessage: "Joyeux anniversaire 🎂",
  quantity: (i % 3) + 1,
}));

function placeOrderDomain(n: number) {
  const basket = priceBasket(lines, products, { fulfilment: "delivery", deliveryFeeRs: 200, limits: { cakeMessageMax: 40 } });
  return { totals: basket, number: formatOrderNumber("APB-", n), token: newTrackingToken() };
}

describe("placeOrder domain work (AC7)", () => {
  test("10 lines priced, totalled, numbered and tokenised in under 1 ms per call", () => {
    for (let i = 0; i < 200; i += 1) placeOrderDomain(i); // warm-up (JIT)
    const runs = 2000;
    const start = performance.now();
    for (let i = 0; i < runs; i += 1) placeOrderDomain(i);
    const perCallMs = (performance.now() - start) / runs;

    expect(placeOrderDomain(1).totals.itemsTotalRs).toBeGreaterThan(0);
    expect(perCallMs).toBeLessThan(1);
  });
});

/** Mean milliseconds per call after a JIT warm-up. */
function perCall(work: () => unknown, runs = 2000): number {
  for (let i = 0; i < 200; i += 1) work();
  const start = performance.now();
  for (let i = 0; i < runs; i += 1) work();
  return (performance.now() - start) / runs;
}

describe("S-097 AC3 (NFR-001): the checkout's domain hot spots stay under 1 ms", () => {
  const NOW = new Date("2026-11-10T08:00:00Z");
  // Two overlapping live offers on every product: the best one is chosen, never stacked (S-082).
  const promotions: PromotionRule[] = [
    { id: "a", startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-11-30T00:00:00Z", active: true, placement: "card", discounts: [...products.keys()].map((productId) => ({ productId, kind: "percent", percentOff: 10, salePriceRs: null })) },
    { id: "b", startsAt: "2026-11-05T00:00:00Z", endsAt: "2026-11-20T00:00:00Z", active: true, placement: "both", discounts: [...products.keys()].map((productId) => ({ productId, kind: "sale_price", percentOff: null, salePriceRs: 450 })) },
  ];

  test("priceBasket for 10 lines with options, a message and two live promotions", () => {
    const price = () =>
      priceBasket(lines, products, { fulfilment: "delivery", deliveryFeeRs: 200, limits: { cakeMessageMax: 40 }, promotionFor: (p) => bestPromotion(p.id, p.basePriceRs, promotions, NOW) });

    expect(price().lines.every((l) => l.promotionId !== null && l.unitPriceRs < l.originalUnitPriceRs + 1)).toBe(true);
    expect(perCall(price)).toBeLessThan(1);
  });

  test("dayStatuses for the 90-day horizon with notice, a closed weekday, blocked ranges and a season", () => {
    const ctx: AvailabilityCtx = { today: "2026-11-10", defaultNoticeDays: 3, closedWeekdays: [7], blocked: [{ startsOn: "2026-12-24", endsOn: "2026-12-26" }, { startsOn: "2027-01-01", endsOn: "2027-01-02" }] };
    const days = () => dayStatuses(ctx, 5, [{ startsOn: "2026-11-01", endsOn: "2026-12-31" }]);

    expect(days()).toHaveLength(90);
    expect(perCall(days)).toBeLessThan(1);
  });
});
