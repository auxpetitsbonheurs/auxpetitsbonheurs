// S-082 / S-062: current promotions for the site (one query, cached per isolate) and the
// promotions the public menu carries (live ones, best first, with their end instant).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertPromotion } from "~/db/testing/promotions";
import { loadMenu } from "~/server/menu.server";
import { getSitePromotions, listCurrentPromotions } from "./promotions.server";

let database: TestDatabase;
let cakeId: string;
const NOW = new Date("2026-11-12T08:00:00.000Z");

beforeEach(async () => {
  database = await createTestDatabase();
  cakeId = await insertProduct(database.db, { basePriceRs: 1000 });
}, 60_000);

afterEach(async () => {
  await database.close();
});

describe("listCurrentPromotions", () => {
  test("active promotions not yet ended, with discounts and the link product; ended and inactive ones are left out", async () => {
    const live = await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", linkKind: "product", linkProductId: cakeId, discounts: [{ productId: cakeId, percentOff: 10 }] });
    const later = await insertPromotion(database, { starts: "2026-11-13T05:00:00Z", ends: "2026-11-13T14:00:00Z" });
    await insertPromotion(database, { starts: "2026-11-11T05:00:00Z", ends: "2026-11-12T08:00:00Z" });
    await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", active: false });

    const rows = await listCurrentPromotions(database.db, NOW);

    expect(rows.map((r) => r.id)).toEqual([live, later]);
    expect(rows[0]).toMatchObject({
      title: { en: "Offer", fr: "Offer (fr)" },
      text: { en: "Ten percent off" },
      placement: "both",
      linkKind: "product",
      linkProduct: { slug: expect.any(String), status: "available" },
      discounts: [{ productId: cakeId, kind: "percent", percentOff: 10, salePriceRs: null }],
    });
    expect(rows[0]!.endsAt.toISOString()).toBe("2026-11-12T14:00:00.000Z");
  });

  test("cached per isolate; a fixed (test) clock reads fresh", async () => {
    const clock = { now: () => NOW };
    expect(await getSitePromotions(database.db, clock)).toEqual([]);
    await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z" });

    expect(await getSitePromotions(database.db, clock)).toEqual([]);
    expect(await getSitePromotions(database.db, { ...clock, fixed: true })).toHaveLength(1);
  });
});

describe("the public menu's promotions (S-082)", () => {
  test("live promotions per product, best first, with the end instant; none before the start", async () => {
    const tenPercent = await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", discounts: [{ productId: cakeId, percentOff: 10 }] });
    const flash = await insertPromotion(database, { starts: "2026-11-12T06:00:00Z", ends: "2026-11-12T10:00:00Z", discounts: [{ productId: cakeId, salePriceRs: 700 }] });
    await insertPromotion(database, { starts: "2026-11-12T09:00:00Z", ends: "2026-11-12T14:00:00Z", discounts: [{ productId: cakeId, salePriceRs: 100 }] });

    const menu = await loadMenu({ db: database.db, supabaseUrl: "https://storage.test", now: NOW });

    expect(menu.data.products[0]!.promos).toEqual([
      { id: flash, salePriceRs: 700, endsAt: Date.parse("2026-11-12T10:00:00Z") },
      { id: tenPercent, salePriceRs: 900, endsAt: Date.parse("2026-11-12T14:00:00Z") },
    ]);
  });
});
