// S-019 AC7 (NFR-001): sanity guard against accidentally heavy domain code on the order
// path. Pure pricing (with a required size and a cake message, S-081) + number + token for a
// 10-line basket must stay well under 1 ms per call on the CI runner. Not a platform CPU
// measurement (that is docs/runbooks/worker-cpu.md).
import { describe, expect, test } from "vitest";
import type { BasketLine } from "./basket";
import { formatOrderNumber, newTrackingToken } from "./order-number";
import { type ProductPricing, priceBasket } from "./pricing";

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
