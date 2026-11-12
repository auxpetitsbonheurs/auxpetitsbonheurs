// `admin/menu` reorder (S-042 AC1, AC4, AC5).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { reorderProducts } from "./reorder-products.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function order(type: string): Promise<string[]> {
  const rows = await database.client.query<{ id: string }>("select id from product where type = $1 order by sort_order, name_en", [type]);
  return rows.rows.map((r) => r.id);
}

async function cakes(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await insertProduct(database.db, { slug: `cake-${i}`, nameEn: `Cake ${i}`, sortOrder: i }));
  return ids;
}

describe("reorderProducts", () => {
  test("AC1: the posted order becomes the type's order", async () => {
    const [a, b, c] = await cakes(3);

    expect(await reorderProducts(database.db, "cake", [c!, a!, b!])).toEqual({ ok: true, type: "cake", ids: [c, a, b] });
    expect(await order("cake")).toEqual([c, a, b]);
    const positions = await database.client.query("select sort_order from product where type = 'cake' order by sort_order");
    expect(positions.rows.map((r) => (r as { sort_order: number }).sort_order)).toEqual([0, 1, 2]);
  });

  test.each([
    ["a product added meanwhile (one missing from the post)", (ids: string[]) => ids.slice(0, 2)],
    ["a product removed meanwhile (an unknown id)", (ids: string[]) => [...ids.slice(0, 2), "7d1f0c9e-1111-4222-8333-944455566677"]],
    ["the same product twice", (ids: string[]) => [ids[0]!, ids[0]!, ids[1]!]],
    ["an extra id", (ids: string[]) => [...ids, "7d1f0c9e-1111-4222-8333-944455566677"]],
  ])("AC4: %s is VALIDATION_FAILED and no order changes", async (_label, change) => {
    const ids = await cakes(3);

    expect(await reorderProducts(database.db, "cake", change(ids))).toEqual({ ok: false, code: "VALIDATION_FAILED" });
    expect(await order("cake")).toEqual(ids);
  });

  test("AC4: a product of another type in the post is refused", async () => {
    const [a, b] = await cakes(2);
    const box = await insertProduct(database.db, { slug: "box", type: "cupcake_box" });

    expect(await reorderProducts(database.db, "cake", [b!, box])).toMatchObject({ ok: false });
    expect(await order("cake")).toEqual([a, b]);
  });

  test("AC5: reordering cakes leaves other types untouched", async () => {
    const [a, b] = await cakes(2);
    const boxes = [
      await insertProduct(database.db, { slug: "box-1", type: "cupcake_box", nameEn: "Box 1", sortOrder: 7 }),
      await insertProduct(database.db, { slug: "box-2", type: "cupcake_box", nameEn: "Box 2", sortOrder: 9 }),
    ];

    await reorderProducts(database.db, "cake", [b!, a!]);

    const rows = await database.client.query<{ id: string; sort_order: number }>("select id, sort_order from product where type = 'cupcake_box' order by sort_order");
    expect(rows.rows).toEqual([
      { id: boxes[0], sort_order: 7 },
      { id: boxes[1], sort_order: 9 },
    ]);
  });
});
