// Catalogue reads (S-011) answer in ONE round trip: every query to Supabase costs a full
// network round trip from the Worker, so product rows and their photos come together.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { productPhoto } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { reorderProducts } from "~/server/services/reorder-products.server";
import { findProductBySlug, findProductsByIds, listMenuProducts } from "./catalogue.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

/** Counts statements the driver sends from now on. */
function countQueries() {
  const query = vi.spyOn(database.client, "query");
  return () => query.mock.calls.length;
}

describe("findProductBySlug", () => {
  test("returns the product with its photos in slot order, in one query", async () => {
    const id = await insertProduct(database.db);
    await database.db.insert(productPhoto).values([
      { productId: id, storagePath: "products/c.webp", width: 10, height: 20, sortOrder: 2 },
      { productId: id, storagePath: "products/b.webp", width: 30, height: 40, sortOrder: 1 },
    ]);
    const queries = countQueries();

    const found = await findProductBySlug(database.db, "chocolate-cake");

    expect(queries()).toBe(1);
    expect(found).toMatchObject({ id, slug: "chocolate-cake", name: { en: "Chocolate cake", fr: "Gâteau au chocolat" }, basePriceRs: 850 });
    expect(found!.photos).toEqual([
      { storagePath: "/images/sample/chocolate-cake.svg", width: 800, height: 600 },
      { storagePath: "products/b.webp", width: 30, height: 40 },
      { storagePath: "products/c.webp", width: 10, height: 20 },
    ]);
  });

  test("a product without photos has an empty list; an unknown slug is undefined", async () => {
    const id = await insertProduct(database.db);
    await database.client.query("delete from product_photo where product_id = $1", [id]);

    expect((await findProductBySlug(database.db, "chocolate-cake"))!.photos).toEqual([]);
    expect(await findProductBySlug(database.db, "nope")).toBeUndefined();
  });
});

describe("findProductsByIds", () => {
  test("returns each product with its own photos, in one query", async () => {
    const a = await insertProduct(database.db);
    const b = await insertProduct(database.db, { slug: "lemon-tart", nameEn: "Lemon tart" });
    await database.client.query("update product_photo set storage_path = 'products/lemon.webp' where product_id = $1", [b]);
    const queries = countQueries();

    const found = await findProductsByIds(database.db, [a, b, a, "33333333-3333-4333-8333-333333333333"]);

    expect(queries()).toBe(1);
    expect([...found.keys()].sort()).toEqual([a, b].sort());
    expect(found.get(b)!.photos).toEqual([{ storagePath: "products/lemon.webp", width: 800, height: 600 }]);
    expect(found.get(a)!.name.en).toBe("Chocolate cake");
  });

  test("no ids, no query", async () => {
    const queries = countQueries();
    expect((await findProductsByIds(database.db, [])).size).toBe(0);
    expect(queries()).toBe(0);
  });
});

describe("listMenuProducts order (S-042 AC2)", () => {
  test("after a reorder the customer menu lists that type's products in the saved order", async () => {
    const ids = [] as string[];
    for (const [i, name] of ["Apple", "Banana", "Cherry"].entries()) ids.push(await insertProduct(database.db, { slug: `c-${i}`, nameEn: `${name} cake`, sortOrder: i }));
    const box = await insertProduct(database.db, { slug: "box", type: "cupcake_box", nameEn: "Box" });

    await reorderProducts(database.db, "cake", [ids[2]!, ids[0]!, ids[1]!]);

    const menu = await listMenuProducts(database.db);
    expect(menu.filter((p) => p.type === "cake").map((p) => p.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(menu.filter((p) => p.type === "cupcake_box").map((p) => p.id)).toEqual([box]);
  });
});
