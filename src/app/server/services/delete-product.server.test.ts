// `admin/menu` delete (S-045): past orders keep their snapshot; links and history go; photo
// files are removed from Storage or queued for the purge job.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { loader as adminOrder } from "~/routes/admin/order";
import { loader as productPage } from "~/routes/site/product";
import { createAfterResponse } from "~/server/after-response.server";
import type { Database } from "~/server/db.server";
import type { StorageGateway } from "~/server/storage.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { deleteProduct } from "./delete-product.server";
import { withVariantPaths } from "~/domain/upload";

let database: TestDatabase;
let db: Database;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
}, 60_000);

afterEach(async () => {
  await database.close();
});

/** A Storage double that records removals, or fails every call. */
function storage(fail = false) {
  const removed: { bucket: string; paths: readonly string[] }[] = [];
  const gateway: StorageGateway = {
    async remove(bucket, paths) {
      if (fail) throw new Error("storage remove answered 503");
      removed.push({ bucket, paths });
    },
  };
  return { gateway, removed };
}

const rows = async <T>(sql: string, params: unknown[] = []) => (await database.client.query<T>(sql, params)).rows;

async function withPhotos(id: string, paths: string[]) {
  await database.client.query("delete from product_photo where product_id = $1", [id]);
  for (const [i, path] of paths.entries()) {
    await database.client.query("insert into product_photo (product_id, storage_path, width, height, sort_order) values ($1, $2, 800, 600, $3)", [id, path, i]);
  }
}

describe("past orders keep their items (S-045 AC1)", () => {
  test("the product goes; the order item keeps name, options and prices with product_id null, and the order page still shows it", async () => {
    const { token } = await placeTestOrder(database, { quantity: 2 });
    const [item] = await rows<{ product_id: string; order_id: string }>("select product_id, order_id from order_item");

    expect(await deleteProduct(db, storage().gateway, item!.product_id)).toEqual({ ok: true, id: item!.product_id, photosQueued: 0 });

    expect(await rows("select count(*)::int as n from product where id = $1", [item!.product_id])).toEqual([{ n: 0 }]);
    expect(await rows("select product_id, name_en, name_fr, options, unit_base_price_rs, line_total_rs, quantity from order_item")).toEqual([
      { product_id: null, name_en: "Chocolate cake", name_fr: "Gâteau au chocolat", options: [], unit_base_price_rs: 850, line_total_rs: 1700, quantity: 2 },
    ]);
    const admin = await signedInAdmin(database);
    const page = await adminOrder(routeArgs(database, { path: `/admin/orders/${item!.order_id}`, params: { id: item!.order_id }, auth: admin.auth, cookie: admin.cookie }) as never);
    expect(page.order.items).toMatchObject([{ name: { en: "Chocolate cake" }, quantity: 2, unitPriceRs: 850, lineTotalRs: 1700 }]);
    expect(token).toBeTruthy();
  });
});

describe("links and history go with it (S-045 AC3)", () => {
  test("promotion_product and product_slug_history rows are removed; old and current URLs are 404", async () => {
    const id = await insertProduct(database.db, { slug: "new-name" });
    await database.client.query("insert into product_slug_history (slug, product_id) values ('old-name', $1)", [id]);
    const [promo] = await rows<{ id: string }>(
      "insert into promotion (title_en, starts_at, ends_at, placement, link_kind, link_product_id) values ('Week', now() - interval '1 day', now() + interval '1 day', 'banner', 'product', $1) returning id",
      [id],
    );
    await database.client.query("insert into promotion_product (promotion_id, product_id, discount_kind, percent_off) values ($1, $2, 'percent', 10)", [promo!.id, id]);

    await deleteProduct(db, storage().gateway, id);

    expect(await rows("select count(*)::int as n from promotion_product")).toEqual([{ n: 0 }]);
    expect(await rows("select count(*)::int as n from product_slug_history")).toEqual([{ n: 0 }]);
    expect(await rows("select link_kind, link_product_id from promotion")).toEqual([{ link_kind: "product", link_product_id: null }]);
    for (const slug of ["new-name", "old-name"]) {
      const status = await productPage(routeArgs(database, { path: `/menu/${slug}`, params: { slug } }) as never).then(
        () => 200,
        (error: { init?: { status: number } }) => error.init?.status,
      );
      expect(status, slug).toBe(404);
    }
  });
});

describe("unknown id (S-045 AC5)", () => {
  test("is NOT_FOUND and nothing changes", async () => {
    const id = await insertProduct(database.db);

    expect(await deleteProduct(db, storage().gateway, "7d1f0c9e-1111-4222-8333-944455566677")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await rows("select count(*)::int as n from product where id = $1", [id])).toEqual([{ n: 1 }]);
  });
});

describe("photo files (S-045 AC6)", () => {
  test("are removed from the public-images bucket (bundled sample images are not Storage objects)", async () => {
    const id = await insertProduct(database.db);
    await withPhotos(id, ["products/p1/a.webp", "products/p1/b.webp", "/images/sample/chocolate-cake.svg"]);
    const { gateway, removed } = storage();

    expect(await deleteProduct(db, gateway, id)).toEqual({ ok: true, id, photosQueued: 0 });

    expect(removed).toEqual([{ bucket: "public-images", paths: withVariantPaths(["products/p1/a.webp", "products/p1/b.webp"]) }]);
    expect(await rows("select count(*)::int as n from storage_purge")).toEqual([{ n: 0 }]);
  });

  test("when Storage fails they are queued for the purge job, and the delete still succeeds", async () => {
    const id = await insertProduct(database.db);
    await withPhotos(id, ["products/p1/a.webp", "products/p1/b.webp"]);

    expect(await deleteProduct(db, storage(true).gateway, id)).toEqual({ ok: true, id, photosQueued: 2 });

    expect(await rows("select count(*)::int as n from product where id = $1", [id])).toEqual([{ n: 0 }]);
    expect(await rows("select bucket, path, attempts, last_error from storage_purge order by path")).toEqual([
      { bucket: "public-images", path: "products/p1/a.webp", attempts: 0, last_error: "storage remove answered 503" },
      { bucket: "public-images", path: "products/p1/b.webp", attempts: 0, last_error: "storage remove answered 503" },
    ]);
  });

  test("with no Storage configured they are queued too", async () => {
    const id = await insertProduct(database.db);
    await withPhotos(id, ["products/p1/a.webp"]);

    expect(await deleteProduct(db, null, id)).toMatchObject({ ok: true, photosQueued: 1 });
  });

  test("in a request, removal waits until the response is ready; a Storage failure still queues them (ADR-0003 amendment 3)", async () => {
    const id = await insertProduct(database.db);
    await withPhotos(id, ["products/p1/a.webp"]);
    const pending: Promise<unknown>[] = [];
    const after = createAfterResponse((p) => void pending.push(p));

    expect(await deleteProduct(db, storage(true).gateway, id, after)).toEqual({ ok: true, id, photosQueued: null });
    expect(await rows("select count(*)::int as n from storage_purge")).toEqual([{ n: 0 }]);

    after.release();
    await after.settled();
    expect(await rows("select path from storage_purge")).toEqual([{ path: "products/p1/a.webp" }]);
  });
});
