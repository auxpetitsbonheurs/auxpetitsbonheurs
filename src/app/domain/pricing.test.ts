// S-081 (pricing domain, server authority): the spec's unit-test table T-PR-* and T-BK-*,
// plus the S-048 option-group warnings and S-012 fee rules. No clock, no network.
import { describe, expect, expectTypeOf, test } from "vitest";
import { DomainError } from "./errors";
import { formatRupees } from "~/lib/locale";
import {
  type LineInput,
  type PricedOptionGroup,
  type PricingGroup,
  type ProductPricing,
  canonicalLine,
  checkoutTotals,
  deliveryFeeFor,
  fromPriceRs,
  graphemeLength,
  lowestOptionPrice,
  optionsCanGoBelowZero,
  priceBasket,
  priceLine,
  productProblem,
  reconcileTotal,
  textOptionProblem,
  validateSelection,
} from "./pricing";
import { bestPromotion } from "./promotions";

const name = (en: string) => ({ en, fr: null });
const group = (id: string, kind: string, required: boolean, choices: [string, number][], extra: Partial<PricingGroup> = {}): PricingGroup => ({
  id,
  name: name(id),
  kind,
  required,
  textMaxLength: null,
  quantityMin: null,
  quantityMax: null,
  choices: choices.map(([choiceId, priceDeltaRs]) => ({ id: choiceId, name: name(choiceId), priceDeltaRs })),
  ...extra,
});

/** Spec fixture P: base 3000; Size, Flavour, Add-ons, Extra cupcakes, Inscription. */
const P: ProductPricing = {
  id: "P",
  name: name("Celebration cake"),
  basePriceRs: 3000,
  status: "available",
  minQuantity: null,
  optionGroups: [
    group("size", "single", true, [["S", 0], ["M", 500], ["L", 1000]]),
    group("flavour", "single", false, [["vanilla", 0], ["choc", 200]]),
    group("addons", "multiple", false, [["candles", 100], ["topper", 300]]),
    group("extra", "quantity", false, [["cupcake", 50]], { quantityMin: 0, quantityMax: 12 }),
    group("inscription", "text", false, [], { textMaxLength: 20 }),
  ],
};
const LIMITS = { cakeMessageMax: 40 };
const size = (id: string) => ({ groupId: "size", choiceIds: [id] });
const line = (options: LineInput["options"], quantity = 1, extra: Partial<LineInput> = {}): LineInput => ({ productId: "P", options, quantity, ...extra });
const price = (input: LineInput, product = P) => priceLine(product, input, null, LIMITS);
const codes = (input: LineInput, product = P) => validateSelection(product, input, LIMITS).map((i) => `${i.field}:${i.code}`);

describe("line pricing (T-PR)", () => {
  test("T-PR-1 Size S, qty 1: unit 3000, total 3000", () => {
    expect(price(line([size("S")]))).toMatchObject({ unitPriceRs: 3000, lineTotalRs: 3000 });
  });

  test("T-PR-2 (AC1) Size M + chocolate: unit 3700; qty 1 total 3700, qty 2 total 7400", () => {
    const options = [size("M"), { groupId: "flavour", choiceIds: ["choc"] }];
    expect(price(line(options, 1))).toMatchObject({ unitPriceRs: 3700, lineTotalRs: 3700 });
    expect(price(line(options, 2))).toMatchObject({ unitPriceRs: 3700, lineTotalRs: 7400 });
  });

  test("T-PR-3 (AC2) pick several adds every chosen delta: M + candles + topper = 3900", () => {
    expect(price(line([size("M"), { groupId: "addons", choiceIds: ["candles", "topper"] }])).unitPriceRs).toBe(3900);
  });

  test("T-PR-4 (AC2) quantity adds unit delta x quantity: M + 3 extra cupcakes = 3650", () => {
    const priced = price(line([size("M"), { groupId: "extra", choiceIds: [], quantity: 3 }]));
    expect(priced.unitPriceRs).toBe(3650);
    expect(priced.options.find((o) => o.groupId === "extra")).toMatchObject({ choiceId: "cupcake", quantity: 3, priceDeltaRs: 150 });
  });

  test("T-PR-5 (AC2) a text option adds nothing and is kept on the line", () => {
    const priced = price(line([size("M"), { groupId: "inscription", choiceIds: [], text: "  Zoé  " }]));
    expect(priced.unitPriceRs).toBe(3500);
    expect(priced.options.at(-1)).toMatchObject({ groupId: "inscription", text: "Zoé", priceDeltaRs: 0 });
  });

  test("T-PR-6 promo sale 2400 on M: unit 2900, original 3500, promotion recorded", () => {
    expect(priceLine(P, line([size("M")]), { promotionId: "promo-1", salePriceRs: 2400 }, LIMITS)).toMatchObject({ unitPriceRs: 2900, originalUnitPriceRs: 3500, promotionId: "promo-1" });
  });

  test("T-PR-7 (AC3) a negative delta is allowed while the line stays >= 0", () => {
    const cheap = { ...P, optionGroups: [group("size", "single", true, [["mini", -500]])] };
    expect(price(line([size("mini")]), cheap).unitPriceRs).toBe(2500);
  });

  test("T-PR-8 (AC3) base 100 with delta -500 is LINE_NEGATIVE", () => {
    const below = { ...P, basePriceRs: 100, optionGroups: [group("size", "single", true, [["mini", -500]])] };
    expect(() => price(line([size("mini")]), below)).toThrow(expect.objectContaining({ code: "LINE_NEGATIVE" }));
  });

  test("T-PR-9 (AC3) base 0, delta 0: a total of 0 is allowed", () => {
    const free = { ...P, basePriceRs: 0, optionGroups: [group("size", "single", true, [["S", 0]])] };
    expect(price(line([size("S")]), free).lineTotalRs).toBe(0);
  });

  test("T-PR-10 (AC4) quantity 0, 51, 1.5 and the string '2' are each a quantity issue", () => {
    for (const quantity of [0, 51, 1.5, "2" as unknown as number]) expect(codes(line([size("S")], quantity))).toEqual(["quantity:quantity"]);
  });

  test("T-PR-11 (AC4) quantity 50 is fine", () => {
    expect(codes(line([size("S")], 50))).toEqual([]);
  });

  test("T-PR-12 (AC5) no Size chosen: required, and every other issue is listed too", () => {
    expect(codes(line([{ groupId: "flavour", choiceIds: ["nope"] }], 0))).toEqual(["quantity:quantity", "options.flavour:unknown_choice", "options.size:required"]);
  });

  test("T-PR-13 (AC5) two Size choices: too_many", () => {
    expect(codes(line([{ groupId: "size", choiceIds: ["S", "M"] }]))).toEqual(["options.size:too_many"]);
  });

  test("T-PR-14 (AC5) an unknown choice id, or one from another group: unknown_choice", () => {
    expect(codes(line([{ groupId: "size", choiceIds: ["XL"] }]))).toEqual(["options.size:unknown_choice"]);
    expect(codes(line([size("S"), { groupId: "flavour", choiceIds: ["candles"] }]))).toEqual(["options.flavour:unknown_choice"]);
    expect(codes(line([size("S"), { groupId: "foreign-group", choiceIds: [] }]))).toEqual(["options.foreign-group:unknown_choice"]);
  });

  test("T-PR-15 (AC5) the same add-on twice: duplicate", () => {
    expect(codes(line([size("S"), { groupId: "addons", choiceIds: ["candles", "candles"] }]))).toEqual(["options.addons:duplicate"]);
  });

  test("T-PR-16 (AC5) quantity pick 13 or -1: quantity_range", () => {
    expect(codes(line([size("S"), { groupId: "extra", choiceIds: [], quantity: 13 }]))).toEqual(["options.extra:quantity_range"]);
    expect(codes(line([size("S"), { groupId: "extra", choiceIds: [], quantity: -1 }]))).toEqual(["options.extra:quantity_range"]);
  });

  test("T-PR-17 (S-067 AC5) Inscription of 21 characters: too_long with its own limit", () => {
    const issues = validateSelection(P, line([size("S"), { groupId: "inscription", choiceIds: [], text: "a".repeat(21) }]), LIMITS);
    expect(issues).toEqual([{ field: "options.inscription", code: "too_long", groupId: "inscription", limit: 20 }]);
  });

  test("T-PR-18 (S-067 AC2, AC3) cake message of exactly 40 graphemes is fine, 41 is too_long", () => {
    expect(codes(line([size("S")], 1, { cakeMessage: "a".repeat(40) }))).toEqual([]);
    expect(codes(line([size("S")], 1, { cakeMessage: "a".repeat(41) }))).toEqual(["cakeMessage:too_long"]);
  });

  test("T-PR-19 (S-067 AC3) emoji and accents count once per grapheme cluster, composed or not", () => {
    expect(graphemeLength("🎂".repeat(40))).toBe(40);
    expect(graphemeLength("👨‍👩‍👧‍👦")).toBe(1);
    expect(graphemeLength("é")).toBe(1);
    expect(graphemeLength("é")).toBe(1);
    expect(codes(line([size("S")], 1, { cakeMessage: "🎂".repeat(40) }))).toEqual([]);
    expect(codes(line([size("S")], 1, { cakeMessage: "é".repeat(40) }))).toEqual([]);
  });

  test("T-PR-20 (S-067 AC4) a message of spaces only is absent", () => {
    expect(price(line([size("S")], 1, { cakeMessage: "     " })).cakeMessage).toBeNull();
    expect(canonicalLine(P, line([size("S")], 1, { cakeMessage: "   " }))).not.toHaveProperty("cakeMessage");
  });

  test("T-PR-21 (AC5) a required text option left empty: required", () => {
    const named = { ...P, optionGroups: [group("name", "text", true, [])] };
    expect(codes(line([{ groupId: "name", choiceIds: [], text: "  " }]), named)).toEqual(["options.name:required"]);
    expect(codes(line([]), named)).toEqual(["options.name:required"]);
  });

  test("T-PR-22 (AC10) fromPriceRs of P is 3000 (required Size, cheapest 0)", () => {
    expect(fromPriceRs(P)).toBe(3000);
  });

  test("T-PR-23 (AC10) required Size S +200: from 3200; with a sale of 2400, 2600", () => {
    const dearer = { ...P, optionGroups: [group("size", "single", true, [["S", 200], ["M", 700]])] };
    expect(fromPriceRs(dearer)).toBe(3200);
    expect(fromPriceRs(dearer, { promotionId: "x", salePriceRs: 2400 })).toBe(2600);
  });

  test("T-PR-24 (AC9) a non-integer, NaN or > 1,000,000 base or delta is INVALID_MONEY", () => {
    for (const basePriceRs of [10.5, Number.NaN, 1_000_001]) expect(() => price(line([size("S")]), { ...P, basePriceRs })).toThrow(expect.objectContaining({ code: "INVALID_MONEY" }));
    const odd = { ...P, optionGroups: [group("size", "single", true, [["S", 0.5]])] };
    expect(() => price(line([size("S")]), odd)).toThrow(DomainError);
  });

  test("(AC9) LineInput has no price field: a client price cannot be passed", () => {
    expectTypeOf<LineInput>().not.toHaveProperty("unitPriceRs");
    expectTypeOf<LineInput>().not.toHaveProperty("priceRs");
    expectTypeOf<LineInput>().not.toHaveProperty("lineTotalRs");
  });

  test("an invalid selection throws SELECTION_INVALID carrying every issue", () => {
    try {
      price(line([], 0));
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "SELECTION_INVALID", details: { issues: [{ code: "quantity" }, { code: "required" }] } });
    }
  });

  test("a product minimum quantity (S-066 AC10): 5 of min 6 is below_min; NULL means no minimum", () => {
    expect(codes(line([size("S")], 5), { ...P, minQuantity: 6 })).toEqual(["quantity:below_min"]);
    expect(codes(line([size("S")], 1), { ...P, minQuantity: null })).toEqual([]);
  });
});

describe("basket totals (T-BK)", () => {
  const catalogue = new Map([[P.id, P]]);
  const m = line([size("M"), { groupId: "flavour", choiceIds: ["choc"] }], 1, { lineId: "a" });
  const m2 = line([size("M"), { groupId: "flavour", choiceIds: ["choc"] }], 2, { lineId: "b" });
  const opts = (fulfilment: "pickup" | "delivery", deliveryFeeRs = 200) => ({ fulfilment, deliveryFeeRs, limits: LIMITS });

  test("T-BK-1 (AC6) 3700 + 7400 for pickup: items 11100, fee 0, total 11100", () => {
    expect(priceBasket([m, m2], catalogue, opts("pickup"))).toMatchObject({ itemsTotalRs: 11100, deliveryFeeRs: 0, totalRs: 11100 });
  });

  test("T-BK-2 (AC6) the same delivered with a Rs 200 fee: total 11300", () => {
    expect(priceBasket([m, m2], catalogue, opts("delivery"))).toMatchObject({ deliveryFeeRs: 200, totalRs: 11300 });
  });

  test("T-BK-3 (AC6) a fee setting of 0: total = items", () => {
    expect(priceBasket([m], catalogue, opts("delivery", 0)).totalRs).toBe(3700);
  });

  test("T-BK-4 (AC6) an empty basket is 0", () => {
    expect(priceBasket([], catalogue, opts("delivery"))).toEqual({ lines: [], itemsTotalRs: 0, deliveryFeeRs: 200, totalRs: 200 });
    expect(priceBasket([], catalogue, opts("pickup")).totalRs).toBe(0);
  });

  test("T-BK-5 (AC7) a sold-out line is marked and left out of the totals", () => {
    const shop = new Map([[P.id, P], ["T", { ...P, id: "T", status: "sold_out" as const }]]);
    const basket = priceBasket([m, { ...m, lineId: "t", productId: "T" }], shop, opts("pickup"));
    expect(basket.lines.map((l) => l.problem)).toEqual([null, "sold_out"]);
    expect(basket.itemsTotalRs).toBe(3700);
  });

  test("T-BK-6 (AC7) hidden, deleted and out-of-season lines are marked hidden / out_of_season", () => {
    const shop = new Map<string, ProductPricing>([
      ["H", { ...P, id: "H", status: "hidden" }],
      ["S", { ...P, id: "S", season: { startsOn: "2026-12-01", endsOn: "2026-12-25" } }],
    ]);
    const basket = priceBasket([{ ...m, productId: "H" }, { ...m, productId: "S" }, { ...m, productId: "gone" }], shop, { ...opts("pickup"), today: "2026-12-26" });
    expect(basket.lines.map((l) => l.problem)).toEqual(["hidden", "out_of_season", "hidden"]);
    expect(basket.totalRs).toBe(0);
  });

  test("a line whose options are no longer offered is options_changed and left out", () => {
    const basket = priceBasket([line([size("XXL")], 1, { lineId: "x" }), m], catalogue, opts("pickup"));
    expect(basket.lines.map((l) => l.problem)).toEqual(["options_changed", null]);
    expect(basket.itemsTotalRs).toBe(3700);
  });

  test("T-BK-7 (AC8) reconcileTotal with the server total is ok", () => {
    expect(reconcileTotal(11300, priceBasket([m, m2], catalogue, opts("delivery")))).toEqual({ ok: true });
  });

  test("T-BK-8 (AC8) a tampered total (one rupee lower, or 1) is PRICE_CHANGED with the server basket", () => {
    const basket = priceBasket([m, m2], catalogue, opts("delivery"));
    for (const shown of [11299, 1]) expect(reconcileTotal(shown, basket)).toEqual({ ok: false, code: "PRICE_CHANGED", basket });
  });

  test("T-BK-9 lines already priced are plain values: a later base price edit changes nothing", () => {
    const product = { ...P };
    const before = priceBasket([m], new Map([[P.id, product]]), opts("pickup"));
    product.basePriceRs = 9999;
    expect(before.lines[0]?.unitPriceRs).toBe(3700);
  });
});

describe("canonicalLine (one stored configuration per choice, S-066 AC6)", () => {
  test("picks follow the product's group order, ids are sorted, blanks and zero quantities are dropped", () => {
    const stored = canonicalLine(P, line([
      { groupId: "addons", choiceIds: ["topper", "candles"] },
      { groupId: "inscription", choiceIds: [], text: "   " },
      { groupId: "extra", choiceIds: [], quantity: 0 },
      size("M"),
    ]));
    expect(stored.options).toEqual([size("M"), { groupId: "addons", choiceIds: ["candles", "topper"] }]);
  });

  test("a quantity group's only choice is filled in; texts are trimmed", () => {
    const stored = canonicalLine(P, line([size("S"), { groupId: "extra", choiceIds: [], quantity: 2 }, { groupId: "inscription", choiceIds: [], text: " Zoé " }], 1, { cakeMessage: " Happy " }));
    expect(stored).toEqual({ productId: "P", options: [size("S"), { groupId: "extra", choiceIds: ["cupcake"], quantity: 2 }, { groupId: "inscription", choiceIds: [], text: "Zoé" }], cakeMessage: "Happy", quantity: 1 });
  });
});

describe("productProblem", () => {
  test("available is orderable; sold out, hidden and missing are not; hidden wins, then season", () => {
    expect(productProblem({ status: "available" })).toBeNull();
    expect(productProblem({ status: "sold_out" })).toBe("sold_out");
    expect(productProblem({ status: "hidden" })).toBe("hidden");
    expect(productProblem(undefined)).toBe("hidden");
    expect(productProblem({ status: "sold_out", season: { startsOn: "2026-12-01", endsOn: "2026-12-25" } }, "2026-12-26")).toBe("out_of_season");
    expect(productProblem({ status: "available", season: { startsOn: "2026-12-01", endsOn: "2026-12-25" } }, "2026-12-25")).toBeNull();
  });
});

describe("delivery fee rule (S-012 AC5, AC6)", () => {
  const priced = priceBasket([line([size("S")], 1)], new Map([[P.id, P]]), { fulfilment: null, deliveryFeeRs: 200, limits: LIMITS }).lines;

  test("delivery adds the Settings fee; pickup and no choice add nothing", () => {
    expect(deliveryFeeFor("delivery", 200)).toBe(200);
    expect(deliveryFeeFor("pickup", 200)).toBe(0);
    expect(deliveryFeeFor(null, 200)).toBe(0);
  });

  test("switching from delivery to pickup removes the fee from the total", () => {
    expect(checkoutTotals(priced, "delivery", 200)).toEqual({ itemsTotalRs: 3000, deliveryFeeRs: 200, totalRs: 3200 });
    expect(checkoutTotals(priced, "pickup", 200)).toEqual({ itemsTotalRs: 3000, deliveryFeeRs: 0, totalRs: 3000 });
  });
});

describe("money output (AC12)", () => {
  test("whole rupees through the E-01 formatter in both languages", () => {
    expect(formatRupees(1250, "en")).toBe("Rs 1,250");
    expect(formatRupees(1250, "fr")).toBe("Rs 1,250");
  });
});

describe("options below Rs 0 (S-048 AC7)", () => {
  const sizeGroup = (deltas: number[], required = true): PricedOptionGroup => ({ kind: "single", required, choices: deltas.map((priceDeltaRs) => ({ priceDeltaRs })) });

  test("base Rs 500 with a choice of minus Rs 600 warns", () => {
    expect(optionsCanGoBelowZero(500, [sizeGroup([0, -600])])).toBe(true);
    expect(lowestOptionPrice(500, [sizeGroup([0, -600])])).toBe(-100);
  });

  test("a Rs 0 choice keeps the base price; positive sizes never warn", () => {
    expect(lowestOptionPrice(1200, [sizeGroup([0, 300, 600])])).toBe(1200);
    expect(optionsCanGoBelowZero(1200, [sizeGroup([0, 300, 600])])).toBe(false);
  });

  test("an optional pick-one group can be skipped, so only negative choices count", () => {
    expect(lowestOptionPrice(500, [sizeGroup([100, 200], false)])).toBe(500);
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
    const g = { required: false, textMaxLength: 25 };

    expect(textOptionProblem("a".repeat(26), g, 40)).toBe("too_long");
    expect(textOptionProblem("a".repeat(25), g, 40)).toBeNull();
  });

  test("a blank max uses the Settings value", () => {
    const g = { required: false, textMaxLength: null };

    expect(textOptionProblem("a".repeat(40), g, 40)).toBeNull();
    expect(textOptionProblem("a".repeat(41), g, 40)).toBe("too_long");
  });

  test("counts characters, not bytes (accents and emoji count once)", () => {
    expect(textOptionProblem("Joyeux anniversaire Zoé 🎂", { required: false, textMaxLength: 25 }, 40)).toBeNull();
  });

  test("blank is refused only when the group is required", () => {
    expect(textOptionProblem("  ", { required: true, textMaxLength: null }, 40)).toBe("missing");
    expect(textOptionProblem(undefined, { required: false, textMaxLength: null }, 40)).toBeNull();
  });
});

describe("promotions on priced lines (S-082 AC5, AC9, AC11)", () => {
  const NOW = new Date("2026-11-12T08:00:00.000Z");
  const promo = {
    id: "promo-20",
    startsAt: new Date("2026-11-12T05:00:00.000Z"),
    endsAt: new Date("2026-11-12T14:00:00.000Z"),
    active: true,
    placement: "card" as const,
    discounts: [{ productId: "P", kind: "percent" as const, percentOff: 20 }],
  };
  const promotionFor = (product: ProductPricing) => bestPromotion(product.id, product.basePriceRs, [promo], NOW);
  const opts = { fulfilment: null, deliveryFeeRs: 0, limits: LIMITS, promotionFor };

  test("AC5: options and the delivery fee are unchanged; the original price is returned for strike-through", () => {
    const options = [size("M"), { groupId: "addons", choiceIds: ["topper"] }];
    const basket = priceBasket([line(options, 2, { lineId: "l1" })], new Map([["P", P]]), { ...opts, fulfilment: "delivery", deliveryFeeRs: 200 });
    // 20% of base 3000 = 2400; + M 500 + topper 300 (never discounted)
    expect(basket.lines[0]).toMatchObject({ unitPriceRs: 3200, originalUnitPriceRs: 3800, lineTotalRs: 6400 });
    expect(basket.lines[0]!.options.map((o) => o.priceDeltaRs)).toEqual([500, 300]);
    expect(basket).toMatchObject({ itemsTotalRs: 6400, deliveryFeeRs: 200, totalRs: 6600 });
  });

  test("AC9: a line priced with a promotion carries its promotionId; once it ended, null", () => {
    const withPromo = priceBasket([line([size("S")], 1, { lineId: "l1" })], new Map([["P", P]]), opts);
    expect(withPromo.lines[0]).toMatchObject({ promotionId: "promo-20", unitPriceRs: 2400, originalUnitPriceRs: 3000 });
    const endedFor = (product: ProductPricing) => bestPromotion(product.id, product.basePriceRs, [promo], promo.endsAt);
    const ended = priceBasket([line([size("S")], 1, { lineId: "l1" })], new Map([["P", P]]), { ...opts, promotionFor: endedFor });
    expect(ended.lines[0]).toMatchObject({ promotionId: null, unitPriceRs: 3000, originalUnitPriceRs: 3000 });
  });

  test("AC11: a promotion on a hidden or sold-out product has no effect (product rules win)", () => {
    for (const status of ["hidden", "sold_out"] as const) {
      const basket = priceBasket([line([size("S")], 1, { lineId: "l1" })], new Map([["P", { ...P, status }]]), opts);
      expect(basket.lines[0]).toMatchObject({ problem: status, promotionId: null });
      expect(basket.itemsTotalRs).toBe(0);
    }
  });
});
