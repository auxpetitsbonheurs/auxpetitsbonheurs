// S-082 (promotions: live window, best price, no stacking) and S-062 AC2/AC6 (banner choice):
// the spec's unit-test table T-PM-*. Every test injects a fixed clock; none reads the system time.
import { describe, expect, test } from "vitest";
import { muDateTimeToInstant } from "./time";
import { type PromotionRule, bestPromotion, isLive, liveBanner, liveCards, promotionStatus, salePriceRs } from "./promotions";

const at = (value: string, ms = 0) => new Date(muDateTimeToInstant(value).getTime() + ms);
const START = at("2026-11-12T09:00");
const END = at("2026-11-12T18:00");

const rule = (id: string, extra: Partial<PromotionRule> = {}): PromotionRule => ({
  id,
  startsAt: START,
  endsAt: END,
  active: true,
  placement: "both",
  discounts: [],
  ...extra,
});
const inside = at("2026-11-12T12:00");

describe("isLive and promotionStatus (AC1, AC2)", () => {
  test("T-PM-1: 12 Nov 09:00 to 18:00 Mauritius, end exclusive", () => {
    const p = rule("a");
    expect(isLive(p, at("2026-11-12T08:59", 59_999))).toBe(false);
    expect(isLive(p, at("2026-11-12T09:00"))).toBe(true);
    expect(isLive(p, at("2026-11-12T17:59", 59_999))).toBe(true);
    expect(isLive(p, at("2026-11-12T18:00"))).toBe(false);
    // 09:00 Mauritius is 05:00 UTC (UTC+4, no DST)
    expect(START.toISOString()).toBe("2026-11-12T05:00:00.000Z");
  });

  test("T-PM-2: active=false inside the window is not live, status inactive", () => {
    const p = rule("a", { active: false });
    expect(isLive(p, inside)).toBe(false);
    expect(promotionStatus(p, inside)).toBe("inactive");
    expect(promotionStatus(p, at("2026-11-13T09:00"))).toBe("inactive");
  });

  test("T-PM-3: status before / inside / after the window", () => {
    const p = rule("a");
    expect(promotionStatus(p, at("2026-11-12T08:59"))).toBe("scheduled");
    expect(promotionStatus(p, inside)).toBe("live");
    expect(promotionStatus(p, END)).toBe("ended");
  });

  test("T-PM-4: endsAt <= startsAt is never live", () => {
    const same = rule("a", { endsAt: START });
    const backwards = rule("b", { startsAt: END, endsAt: START });
    for (const now of [START, inside, END, at("2026-11-12T08:00")]) {
      expect(isLive(same, now)).toBe(false);
      expect(isLive(backwards, now)).toBe(false);
      expect(promotionStatus(backwards, now)).not.toBe("live");
    }
  });

  test("instants given as ISO strings (a JSON snapshot) read the same", () => {
    const p = rule("a", { startsAt: START.toISOString(), endsAt: END.toISOString() });
    expect(isLive(p, inside)).toBe(true);
    expect(isLive(p, END)).toBe(false);
  });
});

describe("salePriceRs (AC3, AC4)", () => {
  test("T-PM-5: 20% on 3000 is 2400", () => {
    expect(salePriceRs(3000, { kind: "percent", percentOff: 20 })).toBe(2400);
  });

  test("T-PM-6, T-PM-9: half-up rounding to whole rupees", () => {
    const pct = (base: number, percentOff: number) => salePriceRs(base, { kind: "percent", percentOff });
    expect([pct(1250, 15), pct(1999, 15), pct(995, 10), pct(100, 33), pct(1, 99)]).toEqual([1063, 1699, 896, 67, 0]);
  });

  test("T-PM-7: a fixed sale price below base", () => {
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: 2500 })).toBe(2500);
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: 0 })).toBe(0);
  });

  test("T-PM-8: a sale price at or above base is not a discount", () => {
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: 3000 })).toBeNull();
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: 3500 })).toBeNull();
  });

  test("T-PM-16: percent 0 or 100, a missing value or nonsense is ignored", () => {
    expect(salePriceRs(3000, { kind: "percent", percentOff: 0 })).toBeNull();
    expect(salePriceRs(3000, { kind: "percent", percentOff: 100 })).toBeNull();
    expect(salePriceRs(3000, { kind: "percent", percentOff: null })).toBeNull();
    expect(salePriceRs(3000, { kind: "percent", percentOff: 12.5 })).toBeNull();
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: -1 })).toBeNull();
    expect(salePriceRs(3000, { kind: "sale_price", salePriceRs: null })).toBeNull();
  });
});

const percent = (productId: string, percentOff: number) => ({ productId, kind: "percent" as const, percentOff, salePriceRs: null });
const fixed = (productId: string, sale: number) => ({ productId, kind: "sale_price" as const, percentOff: null, salePriceRs: sale });

describe("bestPromotion (AC6, AC8)", () => {
  test("T-PM-10: 20% (2400) and a sale price 2200 give 2200 and the second promotion", () => {
    const promos = [rule("p1", { discounts: [percent("cake", 20)] }), rule("p2", { discounts: [fixed("cake", 2200)] })];
    expect(bestPromotion("cake", 3000, promos, inside)).toEqual({ promotionId: "p2", salePriceRs: 2200 });
  });

  test("T-PM-11: 20% and 10% give 2400, never 2160 (no stacking)", () => {
    const promos = [rule("p1", { discounts: [percent("cake", 20)] }), rule("p2", { discounts: [percent("cake", 10)] })];
    expect(bestPromotion("cake", 3000, promos, inside)).toEqual({ promotionId: "p1", salePriceRs: 2400 });
  });

  test("T-PM-12: equal prices: the earlier start, then the lower id", () => {
    const early = rule("b", { startsAt: at("2026-11-11T09:00"), discounts: [fixed("cake", 2000)] });
    const late = rule("a", { discounts: [fixed("cake", 2000)] });
    expect(bestPromotion("cake", 3000, [late, early], inside)?.promotionId).toBe("b");
    const sameStart = [rule("d", { discounts: [fixed("cake", 2000)] }), rule("c", { discounts: [percent("cake", 33), fixed("tart", 1)] })];
    expect(bestPromotion("cake", 3000, sameStart, inside)?.promotionId).toBe("d");
    sameStart[1] = rule("c", { discounts: [fixed("cake", 2000)] });
    expect(bestPromotion("cake", 3000, sameStart, inside)?.promotionId).toBe("c");
  });

  test("T-PM-13: not covering the product, ended cheaper, inactive cheaper: all ignored", () => {
    const promos = [
      rule("other", { discounts: [fixed("tart", 100)] }),
      rule("ended", { startsAt: at("2026-11-01T09:00"), endsAt: at("2026-11-12T09:00"), discounts: [fixed("cake", 100)] }),
      rule("off", { active: false, discounts: [fixed("cake", 100)] }),
      rule("live", { discounts: [percent("cake", 10)] }),
    ];
    expect(bestPromotion("cake", 3000, promos, inside)).toEqual({ promotionId: "live", salePriceRs: 2700 });
    expect(bestPromotion("cake", 3000, promos.slice(0, 3), inside)).toBeNull();
  });

  test("T-PM-16: a non-discount (percent 0, sale >= base) never wins", () => {
    const promos = [rule("zero", { discounts: [percent("cake", 0)] }), rule("high", { discounts: [fixed("cake", 3000)] })];
    expect(bestPromotion("cake", 3000, promos, inside)).toBeNull();
  });
});

describe("liveBanner and liveCards (AC10; S-062 AC2, AC6)", () => {
  const banner = rule("banner", { placement: "banner", startsAt: at("2026-11-12T10:00") });
  const card = rule("card", { placement: "card", startsAt: at("2026-11-12T11:00") });
  const both = rule("both", { placement: "both", startsAt: at("2026-11-12T09:30") });

  test("T-PM-14: the banner is the live banner/both promotion with the latest start; card-only is excluded", () => {
    expect(liveBanner([banner, card, both], inside)?.id).toBe("banner");
    expect(liveBanner([card], inside)).toBeNull();
    expect(liveBanner([both, card], inside)?.id).toBe("both");
    expect(liveBanner([], inside)).toBeNull();
  });

  test("S-062 AC2: equal starts: the lowest id", () => {
    expect(liveBanner([rule("b", { placement: "banner" }), rule("a", { placement: "banner" })], inside)?.id).toBe("a");
  });

  test("S-062 AC6: an inactive or not yet started banner shows nothing", () => {
    expect(liveBanner([rule("off", { placement: "banner", active: false })], inside)).toBeNull();
    expect(liveBanner([rule("later", { placement: "banner", startsAt: at("2026-11-12T13:00") })], inside)).toBeNull();
  });

  test("T-PM-15: cards ordered startsAt desc then id; banner-only excluded", () => {
    const twin = rule("a-twin", { placement: "card", startsAt: at("2026-11-12T11:00") });
    expect(liveCards([both, banner, card, twin], inside).map((p) => p.id)).toEqual(["a-twin", "card", "both"]);
    expect(liveCards([banner], inside)).toEqual([]);
  });
});
