import { eq } from "drizzle-orm";
import { isRouteErrorResponse } from "react-router";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { product } from "~/db/schema";
import { insertProduct } from "~/db/testing/catalogue";
import { insertPromotion } from "~/db/testing/promotions";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_SUPABASE_URL, cookieFrom, routeArgs } from "~/server/testing/route-context";
import { BASKET_COOKIE } from "~/server/basket.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { action as saveInEditor } from "../admin/product";
import { RENAMED_CACHE_CONTROL, action, loader, productView, shouldRevalidate } from "./product";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const view = (path: string, slug = "chocolate-cake") =>
  loader(routeArgs(database, { path, params: { slug } }) as never);

/** The HTTP status of what the loader threw (`data(null, { status })` or a Response). */
async function thrownStatus(promise: Promise<unknown>): Promise<number | undefined> {
  try {
    await promise;
  } catch (error) {
    if (isRouteErrorResponse(error)) return error.status;
    if (error instanceof Response) return error.status;
    return (error as { init?: { status?: number } }).init?.status;
  }
  throw new Error("expected the loader to throw");
}

function addToBasket(productId: string, cookie?: string, path = "/menu/chocolate-cake", extra: Record<string, string> = {}) {
  return action(
    routeArgs(database, { path, params: { slug: "chocolate-cake" }, cookie, form: { intent: "addToBasket", productId, quantity: "1", ...extra } }) as never,
  );
}

describe("product page (S-011 AC1)", () => {
  test("shows name, description, Rs 850 and the photo with the name as alt text", async () => {
    await insertProduct(database.db);

    const data = await view("/menu/chocolate-cake");
    const shown = productView(data.product, "en");

    expect(shown).toMatchObject({
      name: "Chocolate cake",
      description: "A rich chocolate sponge with ganache.",
      price: "Rs 850",
      addable: true,
    });
    expect(shown.photos).toEqual([
      { url: "/images/sample/chocolate-cake.svg", width: 800, height: 600, alt: "Chocolate cake" },
    ]);
  });

  test("Storage photos are served from the public-images bucket", async () => {
    const id = await insertProduct(database.db, { slug: "lemon-tart", nameEn: "Lemon tart" });
    await database.client.query(`update product_photo set storage_path = 'products/lemon.webp' where product_id = $1`, [id]);

    const data = await view("/menu/lemon-tart", "lemon-tart");
    expect(data.product.photos[0]!.url).toBe(`${TEST_SUPABASE_URL}/storage/v1/object/public/public-images/products/lemon.webp`);
  });
});

describe("unknown or hidden product (S-011 AC2)", () => {
  test("an unknown slug is a 404", async () => {
    expect(await thrownStatus(view("/menu/nope", "nope"))).toBe(404);
  });

  test("a hidden product is a 404", async () => {
    await insertProduct(database.db, { status: "hidden" });

    expect(await thrownStatus(view("/menu/chocolate-cake"))).toBe(404);
  });
});

describe("sold-out product (S-011 AC3)", () => {
  test("renders as sold out and not addable", async () => {
    await insertProduct(database.db, { status: "sold_out" });

    const data = await view("/menu/chocolate-cake");
    expect(data.product.status).toBe("sold_out");
    expect(productView(data.product, "en").addable).toBe(false);
  });

  test("gives no earliest date: the Sold out area says what to do instead (leftovers bug)", async () => {
    await insertProduct(database.db, { status: "sold_out" });

    expect((await view("/menu/chocolate-cake")).earliestDate).toBeNull();
  });

  test("a forged addToBasket is refused with PRODUCT_UNAVAILABLE (409) and the basket is unchanged", async () => {
    const id = await insertProduct(database.db, { status: "sold_out" });

    const result = await addToBasket(id);
    expect(result).not.toBeInstanceOf(Response);
    const refused = result as unknown as { data: { ok: false; error: { code: string; message: string } }; init: { status: number; headers?: unknown } };
    expect(refused.init.status).toBe(409);
    expect(refused.data.error.code).toBe("PRODUCT_UNAVAILABLE");
    expect(refused.data.error.message).not.toBe("");
    expect(refused.init.headers).toBeUndefined();
  });

  test("a hidden or unknown product id is refused the same way", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });

    for (const productId of [id, "33333333-3333-4333-8333-333333333333"]) {
      const refused = (await addToBasket(productId)) as unknown as { data: { error: { code: string } }; init: { status: number } };
      expect(refused.init.status).toBe(409);
      expect(refused.data.error.code).toBe("PRODUCT_UNAVAILABLE");
    }
  });

  test("a malformed post is VALIDATION_FAILED (400)", async () => {
    const refused = (await addToBasket("not-a-uuid")) as unknown as { data: { error: { code: string } }; init: { status: number } };
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("add to basket (S-011 AC4, AC5)", () => {
  test("stores the line in the cookie and redirects to /basket (or /fr/basket)", async () => {
    const id = await insertProduct(database.db);

    const response = (await addToBasket(id)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/basket");
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain(`${BASKET_COOKIE}=`);
    expect(cookie).not.toContain("HttpOnly"); // ADR-0004: the browser writes it too

    const fr = (await addToBasket(id, undefined, "/fr/menu/chocolate-cake")) as Response;
    expect(fr.headers.get("Location")).toBe("/fr/basket");
  });

  test("with JavaScript (respond=inline) it stays on the page: { ok, basketCount } plus the cookie, no redirect", async () => {
    const id = await insertProduct(database.db);

    const first = (await addToBasket(id, undefined, undefined, { respond: "inline" })) as unknown as { data: { ok: true; basketCount: number }; init: { status?: number; headers: Record<string, string> } };
    expect(first).not.toBeInstanceOf(Response);
    expect(first.data).toEqual({ ok: true, basketCount: 1 });
    expect(first.init.status ?? 200).toBe(200);
    const cookie = cookieFrom(first.init.headers["Set-Cookie"]!);

    const second = (await addToBasket(id, cookie, undefined, { respond: "inline" })) as unknown as { data: { basketCount: number } };
    expect(second.data.basketCount).toBe(2);
  });

  test("an 11th distinct product is BASKET_FULL (422)", async () => {
    let cookie: string | undefined;
    for (let i = 0; i < 10; i += 1) {
      const id = await insertProduct(database.db, { slug: `cake-${i}` });
      cookie = cookieFrom(((await addToBasket(id, cookie)) as Response).headers.get("Set-Cookie"));
    }
    const eleventh = await insertProduct(database.db, { slug: "cake-11" });

    const refused = (await addToBasket(eleventh, cookie)) as unknown as { data: { error: { code: string } }; init: { status: number; headers?: unknown } };
    expect(refused.init.status).toBe(422);
    expect(refused.data.error.code).toBe("BASKET_FULL");
    expect(refused.init.headers).toBeUndefined();
  });
});

describe("page language (S-011 AC7)", () => {
  test("French shows the French name, and falls back to English when there is none", async () => {
    await insertProduct(database.db);
    const fr = await view("/fr/menu/chocolate-cake");
    expect(productView(fr.product, "fr").name).toBe("Gâteau au chocolat");
    expect(productView(fr.product, "fr").photos[0]!.alt).toBe("Gâteau au chocolat");

    await database.db.update(product).set({ nameFr: null }).where(eq(product.slug, "chocolate-cake"));
    const fallback = await view("/fr/menu/chocolate-cake");
    expect(productView(fallback.product, "fr").name).toBe("Chocolate cake");
  });
});

describe("a product saved in the editor with English only (S-046 AC2)", () => {
  test("its French page shows the English name and description", async () => {
    const admin = await signedInAdmin(database);
    const form = { intent: "save", "name.en": "Lemon tart", "description.en": "Sharp and sweet.", basePriceRs: "450", type: "dessert", status: "hidden" };
    const saved = (await saveInEditor(routeArgs(database, { path: "/admin/menu/new", auth: admin.auth, cookie: admin.cookie, form }) as never)) as { id: string };
    await insertPhotoAndShow(saved.id);

    const fr = await view("/fr/menu/lemon-tart", "lemon-tart");

    expect(productView(fr.product, "fr")).toMatchObject({ name: "Lemon tart", description: "Sharp and sweet." });
  });
});

async function insertPhotoAndShow(id: string) {
  await database.client.query("insert into product_photo (product_id, storage_path, width, height, sort_order) values ($1, '/images/sample/chocolate-cake.svg', 800, 600, 0)", [id]);
  await database.client.query("update product set status = 'available' where id = $1", [id]);
}

describe("renamed product links (S-050)", () => {
  async function renamed(from: string[], to: string, overrides: Parameters<typeof insertProduct>[1] = {}) {
    const id = await insertProduct(database.db, { slug: to, ...overrides });
    for (const slug of from) await database.client.query("insert into product_slug_history (slug, product_id) values ($1, $2)", [slug, id]);
    return id;
  }

  /** The redirect the loader threw (a Response). */
  async function thrownRedirect(path: string, slug: string): Promise<Response> {
    try {
      await view(path, slug);
    } catch (error) {
      if (error instanceof Response) return error;
      throw error;
    }
    throw new Error("expected a redirect");
  }

  test("AC2: an old slug answers 301 to the current one; /fr keeps the language", async () => {
    await renamed(["a"], "b");

    const en = await thrownRedirect("/menu/a", "a");
    expect(en.status).toBe(301);
    expect(en.headers.get("location")).toBe("/menu/b");
    // Cached an hour, not forever: the product may take the old slug back (AC6).
    expect(en.headers.get("cache-control")).toBe(RENAMED_CACHE_CONTROL);
    const fr = await thrownRedirect("/fr/menu/a", "a");
    expect(fr.status).toBe(301);
    expect(fr.headers.get("location")).toBe("/fr/menu/b");
  });

  test("AC2: a current slug is served directly, before any history lookup", async () => {
    await renamed(["old"], "chocolate-cake");

    expect((await view("/menu/chocolate-cake")).product.slug).toBe("chocolate-cake");
  });

  test("AC3: after two renames both old slugs go straight to the newest", async () => {
    await renamed(["a", "b"], "c");

    expect((await thrownRedirect("/menu/a", "a")).headers.get("location")).toBe("/menu/c");
    expect((await thrownRedirect("/menu/b", "b")).headers.get("location")).toBe("/menu/c");
  });

  test("AC4: the target's own rules apply (hidden answers 404 there); a deleted product's old slug is 404", async () => {
    const id = await renamed(["a"], "b", { status: "hidden" });

    expect((await thrownRedirect("/menu/a", "a")).headers.get("location")).toBe("/menu/b");
    expect(await thrownStatus(view("/menu/b", "b"))).toBe(404);

    await database.client.query("delete from product where id = $1", [id]);
    expect(await thrownStatus(view("/menu/a", "a"))).toBe(404);
  });

  test("AC6: a product back on an old slug is served there, without a redirect loop", async () => {
    const admin = await signedInAdmin(database);
    const fields = { intent: "save", "name.en": "Lemon tart", "description.en": "", basePriceRs: "400", type: "cake", status: "hidden" };
    const created = (await saveInEditor(routeArgs(database, { path: "/admin/menu/new", auth: admin.auth, cookie: admin.cookie, form: fields }) as never)) as { id: string };
    await insertPhotoAndShow(created.id);
    const edit = (slug: string) =>
      saveInEditor(
        routeArgs(database, { path: `/admin/menu/${created.id}`, params: { id: created.id }, auth: admin.auth, cookie: admin.cookie, form: { ...fields, status: "available", slug } }) as never,
      );

    await edit("lemon-tart-2");
    await edit("lemon-tart");

    expect((await view("/menu/lemon-tart", "lemon-tart")).product.id).toBe(created.id);
    expect((await thrownRedirect("/menu/lemon-tart-2", "lemon-tart-2")).headers.get("location")).toBe("/menu/lemon-tart");
  });

  test("AC8: Location is a same-site relative path built from the stored slug, never from the request", async () => {
    await renamed(["a"], "b");

    const location = (await thrownRedirect("/menu/a?next=https://evil.example", "a")).headers.get("location")!;

    expect(location).toBe("/menu/b");
    expect(location.startsWith("//")).toBe(false);
    expect(/^[a-z]+:/i.test(location)).toBe(false);
  });
});

describe("revalidation after Add (staging latency)", () => {
  const args = (intent: string, ok: boolean) =>
    ({ formData: new URLSearchParams({ intent }) as unknown as FormData, actionResult: { ok }, defaultShouldRevalidate: true }) as never;

  test("a successful inline add does not reload the product (only the header count changes)", () => {
    expect(shouldRevalidate(args("addToBasket", true))).toBe(false);
  });

  test("anything else keeps the default", () => {
    expect(shouldRevalidate(args("addToBasket", false))).toBe(true);
    expect(shouldRevalidate({ defaultShouldRevalidate: true } as never)).toBe(true);
  });
});

describe("a live promotion on the product page (S-066 AC4, S-082)", () => {
  const at = (now: string) => loader(routeArgs(database, { path: "/menu/chocolate-cake", params: { slug: "chocolate-cake" }, now }) as never);
  const t = (key: string, values?: Record<string, string | number>) => (key === "promo.endsOn" ? `Offer ends ${values?.date} at ${values?.time}` : key);

  test("the original is struck, the sale shown and 'Offer ends' given in Mauritius time; at ends_at a reload shows no sale (fixed clock)", async () => {
    const id = await insertProduct(database.db, { basePriceRs: 1000 });
    // 12 Nov 09:00 to 18:00 Mauritius, 20% off
    const promotionId = await insertPromotion(database, { title: "Spring offer", starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", discounts: [{ productId: id, percentOff: 20 }] });

    const during = await at("2026-11-12T13:59:59.000Z");
    expect(during.product).toMatchObject({ basePriceRs: 1000, salePriceRs: 800, promotionId, promotion: { title: { en: "Spring offer" }, endsAt: "2026-11-12T14:00:00.000Z" } });
    expect(productView(during.product, "en", t)).toMatchObject({ price: "Rs 800", wasPrice: "Rs 1,000", offerEnds: "Offer ends Thu 12 Nov at 18:00" });

    const after = await at("2026-11-12T14:00:00.000Z");
    expect(after.product).toMatchObject({ salePriceRs: null, promotionId: null, promotion: null });
    expect(productView(after.product, "en", t)).toMatchObject({ price: "Rs 1,000", wasPrice: null, offerEnds: null });
  });

  test("two live offers: the lowest price only (no stacking); a sold-out product shows none (S-082 AC6, AC11)", async () => {
    const id = await insertProduct(database.db, { basePriceRs: 1000 });
    await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", discounts: [{ productId: id, percentOff: 20 }] });
    const cheaper = await insertPromotion(database, { starts: "2026-11-12T05:00:00Z", ends: "2026-11-12T14:00:00Z", discounts: [{ productId: id, salePriceRs: 700 }] });

    expect((await at("2026-11-12T08:00:00Z")).product).toMatchObject({ salePriceRs: 700, promotionId: cheaper });
    await database.client.query("update product set status = 'sold_out' where id = $1", [id]);
    expect((await at("2026-11-12T08:00:00Z")).product).toMatchObject({ salePriceRs: null, promotionId: null });
  });
});
