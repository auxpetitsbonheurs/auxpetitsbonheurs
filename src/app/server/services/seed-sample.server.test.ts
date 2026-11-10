import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { SeedSampleRefused, seedSample } from "./seed-sample.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const count = async (table: string) =>
  (await database.client.query<{ n: number }>(`select count(*)::int as n from ${table}`)).rows[0]!.n;

describe("seed:sample (S-011 sample data)", () => {
  test("inserts the chocolate cake at Rs 850 with one photo, once", async () => {
    expect(await seedSample(database.db, "development")).toBe("created");
    expect(await seedSample(database.db, "staging")).toBe("exists");

    const { rows } = await database.client.query<{ slug: string; base_price_rs: number; status: string }>(
      "select slug, base_price_rs, status from product",
    );
    expect(rows).toEqual([{ slug: "chocolate-cake", base_price_rs: 850, status: "available" }]);
    expect(await count("product_photo")).toBe(1);
  });

  test("refuses to run with APP_ENV=production", async () => {
    await expect(seedSample(database.db, "production")).rejects.toBeInstanceOf(SeedSampleRefused);
    expect(await count("product")).toBe(0);
  });
});
