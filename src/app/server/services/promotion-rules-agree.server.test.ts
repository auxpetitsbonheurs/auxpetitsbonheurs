// S-082 (FR-016, FR-017): one rule set in two places. The `place_order` procedure picks a
// line's promotion with `product_promotion` (drizzle/0012); the server and the pages pick it
// with domain/promotions bestPromotion. For any set of promotion rows, any base price and any
// instant (including the exact start and end), both must give the same promotion and price.
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { type PromotionRule, bestPromotion } from "~/domain/promotions";

let database: TestDatabase;
let productId: string;
let otherId: string;

beforeAll(async () => {
  database = await createTestDatabase();
  productId = await insertProduct(database.db, { basePriceRs: 1000 });
  otherId = await insertProduct(database.db, { slug: "other-cake", nameEn: "Other cake", basePriceRs: 1000 });
}, 60_000);

afterAll(async () => {
  await database.close();
});

const T0 = Date.parse("2026-11-12T05:00:00.000Z");
const HOUR = 3_600_000;

const rowArb = fc.record({
  // a few fixed ids so ties on price and start fall back to the id
  id: fc.constantFrom("00000000-0000-4000-8000-00000000000a", "00000000-0000-4000-8000-00000000000b", "00000000-0000-4000-8000-0000000000c1", "ffffffff-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000000"),
  start: fc.integer({ min: -3, max: 3 }),
  length: fc.integer({ min: 1, max: 5 }),
  active: fc.boolean(),
  covers: fc.boolean(),
  percent: fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
  sale: fc.integer({ min: 0, max: 1_500 }),
});

type Row = typeof rowArb extends fc.Arbitrary<infer R> ? R : never;

async function store(rows: Row[]) {
  await database.client.query("delete from promotion");
  for (const r of rows) {
    await database.client.query("insert into promotion (id, title_en, starts_at, ends_at, active, placement) values ($1, 'x', $2, $3, $4, 'card')", [
      r.id, new Date(T0 + r.start * HOUR).toISOString(), new Date(T0 + (r.start + r.length) * HOUR).toISOString(), r.active,
    ]);
    await database.client.query("insert into promotion_product (promotion_id, product_id, discount_kind, percent_off, sale_price_rs) values ($1, $2, $3, $4, $5)", [
      r.id, r.covers ? productId : otherId, r.percent === null ? "sale_price" : "percent", r.percent, r.percent === null ? r.sale : null,
    ]);
  }
}

const rules = (rows: Row[]): PromotionRule[] =>
  rows.map((r) => ({
    id: r.id,
    startsAt: new Date(T0 + r.start * HOUR),
    endsAt: new Date(T0 + (r.start + r.length) * HOUR),
    active: r.active,
    placement: "card",
    discounts: [{ productId: r.covers ? productId : otherId, kind: r.percent === null ? "sale_price" : "percent", percentOff: r.percent, salePriceRs: r.percent === null ? r.sale : null }],
  }));

describe("product_promotion (SQL) and bestPromotion (TS) agree (S-082 AC1-AC8)", () => {
  test("same promotion and sale price for any rows, base and instant (boundaries included)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(rowArb, { selector: (r) => r.id, maxLength: 5 }),
        fc.integer({ min: 0, max: 2_000 }),
        fc.integer({ min: -4, max: 6 }),
        fc.constantFrom(-1, 0, 1),
        async (rows, base, hour, nudge) => {
          await store(rows);
          const now = new Date(T0 + hour * HOUR + nudge);
          const { rows: sql } = await database.client.query<{ promo: { promotionId: string; salePriceRs: number } | null }>(
            "select product_promotion($1, $2, $3) as promo", [productId, base, now.toISOString()],
          );
          const fromSql = sql[0]!.promo ? { promotionId: sql[0]!.promo.promotionId, salePriceRs: sql[0]!.promo.salePriceRs } : null;
          expect(fromSql).toEqual(bestPromotion(productId, base, rules(rows), now));
        },
      ),
      { numRuns: 120 },
    );
  }, 120_000);
});
