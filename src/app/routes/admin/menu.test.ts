// `admin/menu` (S-041 list; S-043 setStatus; S-045 delete).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { TEST_SUPABASE_URL, routeArgs } from "~/server/testing/route-context";
import { loadMenu } from "~/server/menu.server";
import { loader as productPage } from "../site/product";
import { action, loader } from "./menu";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

const load = (s = session) => loader(routeArgs(database, { path: "/admin/menu", auth: s.auth, cookie: s.cookie }) as never);

async function caught(run: () => unknown): Promise<Response> {
  try {
    await run();
  } catch (error) {
    return error as Response;
  }
  throw new Error("expected a thrown response");
}

describe("menu list grouped by type (S-041 AC1)", () => {
  test("groups products under Cakes, Cupcake boxes, Desserts and Seasonal with photo, name, from-price and tags", async () => {
    const cake = await insertProduct(database.db, { slug: "choc", nameEn: "Chocolate cake", basePriceRs: 850 });
    const sold = await insertProduct(database.db, { slug: "lemon", nameEn: "Lemon cake", status: "sold_out", sortOrder: 1, basePriceRs: 900 });
    const box = await insertProduct(database.db, { slug: "box", type: "cupcake_box", nameEn: "Box of 6", nameFr: null, status: "hidden", basePriceRs: 600 });
    const xmas = await insertProduct(database.db, { slug: "log", type: "seasonal", nameEn: "Yule log", seasonalStartsOn: "2026-12-01", seasonalEndsOn: "2026-12-24" });
    const easter = await insertProduct(database.db, { slug: "egg", type: "dessert", nameEn: "Egg tart", seasonalStartsOn: "2026-11-01", seasonalEndsOn: "2026-11-30" });

    const page = await load();

    expect(Object.keys(page.byType)).toEqual(["cake", "cupcake_box", "dessert", "seasonal"]);
    expect(page.byType.cake.map((r) => r.id)).toEqual([cake, sold]);
    expect(page.byType.cake[0]).toEqual({
      id: cake,
      name: { en: "Chocolate cake", fr: "Gâteau au chocolat" },
      status: "available",
      imageUrl: "/images/sample/chocolate-cake.svg",
      sortOrder: 0,
      fromPriceRs: 850,
      seasonal: null,
    });
    expect(page.byType.cake[1]).toMatchObject({ status: "sold_out", fromPriceRs: 900 });
    expect(page.byType.cupcake_box[0]).toMatchObject({ id: box, status: "hidden", name: { en: "Box of 6", fr: null } });
    expect(page.byType.seasonal[0]).toMatchObject({ id: xmas, seasonal: "scheduled" });
    expect(page.byType.dessert[0]).toMatchObject({ id: easter, seasonal: "current" });
  });

  test("the view's row text: from-price as \"Rs 850\" and tags as words", async () => {
    await insertProduct(database.db, { slug: "lemon", nameEn: "Lemon cake", status: "sold_out" });
    const { rowView } = await import("./menu");

    const page = await load();
    const view = rowView(page.byType.cake[0]!, "en", (key) => key);

    expect(view.price).toBe("Rs 850");
    expect(view.tags).toEqual(["admin.menu.tag.sold_out"]);
  });
});

describe("empty groups (S-041 AC2)", () => {
  test("a type with no products is an empty list", async () => {
    await insertProduct(database.db);

    const page = await load();

    expect(page.byType.cupcake_box).toEqual([]);
    expect(page.byType.dessert).toEqual([]);
    expect(page.byType.seasonal).toEqual([]);
  });
});

describe("who may open the menu (S-041 AC4)", () => {
  test("an Admin (not only an Owner) loads it", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });
    await insertProduct(database.db);

    const page = await load(helper);

    expect(page.byType.cake).toHaveLength(1);
  });

  test("an anonymous visitor is redirected to /admin/login with no menu data", async () => {
    const refused = await caught(() => loader(routeArgs(database, { path: "/admin/menu" }) as never));

    expect(refused.status).toBe(302);
    expect(refused.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu");
  });

  test("a customer session is redirected the same way", async () => {
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const refused = await caught(() => loader(routeArgs(database, { path: "/admin/menu", auth, cookie }) as never));

    expect(refused.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu");
  });
});

describe("no photo (S-041 AC5)", () => {
  test("a product without a photo has imageUrl null (the view shows a decorative placeholder)", async () => {
    const id = await insertProduct(database.db, { slug: "bare", status: "hidden" });
    await database.client.query("delete from product_photo where product_id = $1", [id]);

    const page = await load();

    expect(page.byType.cake[0]!.imageUrl).toBeNull();
  });
});

describe("French admin (S-041 AC8)", () => {
  test("the page title is French; names follow the locale with English fallback; tags are French", async () => {
    const french = await signedInAdmin(database, { locale: "fr" });
    await insertProduct(database.db, { slug: "box", type: "cupcake_box", nameEn: "Box of 6", nameFr: null, status: "hidden" });
    await insertProduct(database.db, { slug: "choc", status: "sold_out" });
    const { rowView } = await import("./menu");
    const { t } = await import("~/i18n/catalog.server");

    const page = await load(french);
    const tr = (key: string) => t(key, "fr");

    expect(page.title).toBe("Carte");
    expect(rowView(page.byType.cupcake_box[0]!, "fr", tr)).toMatchObject({ name: "Box of 6", tags: ["Masqué"] });
    expect(rowView(page.byType.cake[0]!, "fr", tr)).toMatchObject({ name: "Gâteau au chocolat", tags: ["Épuisé"] });
    expect(tr("admin.menu.group.cupcake_box")).toBe("Boîtes de cupcakes");
  });
});

// ----- S-043: hide or mark sold out -----

const post = (form: Record<string, string>, s: { auth: FakeAuth; cookie?: string } = session) =>
  action(routeArgs(database, { path: "/admin/menu", auth: s.auth, cookie: s.cookie, form }) as never) as Promise<unknown>;
const setStatus = (id: string, status: string, s?: { auth: FakeAuth; cookie?: string }) => post({ intent: "setStatus", id, status }, s);
const statusOf = async (id: string) => (await database.client.query<{ status: string }>("select status from product where id = $1", [id])).rows[0]?.status;
type Refusal = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

async function productPageStatus(slug: string): Promise<number | "ok"> {
  try {
    await productPage(routeArgs(database, { path: `/menu/${slug}`, params: { slug } }) as never);
    return "ok";
  } catch (error) {
    return (error as { init?: { status: number } }).init?.status ?? (error as Response).status;
  }
}

describe("mark sold out (S-043 AC1)", () => {
  test("answers { ok, id, status } and the customer page shows Sold out, not addable", async () => {
    const id = await insertProduct(database.db);

    expect(await setStatus(id, "sold_out")).toEqual({ ok: true, id, status: "sold_out" });

    const page = await productPage(routeArgs(database, { path: "/menu/chocolate-cake", params: { slug: "chocolate-cake" } }) as never);
    expect(page.product.status).toBe("sold_out");
  });

  test("the cached menu's version changes and lists it as sold out (ADR-0004)", async () => {
    const id = await insertProduct(database.db);
    const menu = () => loadMenu({ db: database.db as never, supabaseUrl: TEST_SUPABASE_URL, now: new Date("2026-11-10T08:00:00Z") });
    const before = await menu();

    await setStatus(id, "sold_out");

    const after = await menu();
    expect(after.v).not.toBe(before.v);
    expect(after.data.products.find((p) => p.id === id)?.status).toBe("sold_out");
  });
});

describe("hide (S-043 AC2)", () => {
  test("the product URL is a 404 and it leaves the public menu", async () => {
    const id = await insertProduct(database.db);

    await setStatus(id, "hidden");

    expect(await productPageStatus("chocolate-cake")).toBe(404);
    const menu = await loadMenu({ db: database.db as never, supabaseUrl: TEST_SUPABASE_URL, now: new Date("2026-11-10T08:00:00Z") });
    expect(menu.data.products.map((p) => p.id)).not.toContain(id);
  });
});

describe("show again (S-043 AC3)", () => {
  test.each(["hidden", "sold_out"] as const)("a %s product becomes available", async (from) => {
    const id = await insertProduct(database.db, { status: from });

    expect(await setStatus(id, "available")).toEqual({ ok: true, id, status: "available" });
    expect(await statusOf(id)).toBe("available");
  });
});

describe("photo rule (S-043 AC4)", () => {
  test("no photo: available is VALIDATION_FAILED \"Add a photo first\"; hidden is allowed", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });
    await database.client.query("delete from product_photo where product_id = $1", [id]);

    const refused = (await setStatus(id, "available")) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    expect(refused.data.error.fields?.status).toMatch(/^Add a photo first/);
    expect(await statusOf(id)).toBe("hidden");
    expect(await setStatus(id, "hidden")).toMatchObject({ ok: true });
  });
});

describe("bad input (S-043 AC5)", () => {
  test("an unknown id is NOT_FOUND and nothing changes", async () => {
    const id = await insertProduct(database.db);

    const refused = (await setStatus("7d1f0c9e-1111-4222-8333-944455566677", "hidden")) as Refusal;

    expect(refused.init.status).toBe(404);
    expect(refused.data.error.code).toBe("NOT_FOUND");
    expect(await statusOf(id)).toBe("available");
  });

  test.each([
    ["an invalid status", (id: string) => ({ intent: "setStatus", id, status: "gone" })],
    ["a malformed id", () => ({ intent: "setStatus", id: "nope", status: "hidden" })],
    ["an unknown intent", (id: string) => ({ intent: "explode", id })],
  ])("%s is VALIDATION_FAILED and nothing changes", async (_label, form) => {
    const id = await insertProduct(database.db);

    expect(((await post(form(id))) as Refusal).init.status).toBe(400);
    expect(await statusOf(id)).toBe("available");
  });
});

describe("who may change a status (S-043 AC7)", () => {
  test("an Admin can", async () => {
    const id = await insertProduct(database.db);
    const helper = await signedInAdmin(database, { role: "admin" });

    expect(await setStatus(id, "hidden", helper)).toMatchObject({ ok: true });
  });

  test("an anonymous visitor is redirected to sign in; nothing changes", async () => {
    const id = await insertProduct(database.db);

    const refused = await caught(() => setStatus(id, "hidden", { auth: new FakeAuth() }));

    expect(refused.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu");
    expect(await statusOf(id)).toBe("available");
  });

  test("a customer session is refused with 403; nothing changes", async () => {
    const id = await insertProduct(database.db);
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const refused = (await caught(() => setStatus(id, "hidden", { auth, cookie }))) as Response & { init?: { status: number } };

    expect(refused.init?.status ?? refused.status).toBe(403);
    expect(await statusOf(id)).toBe("available");
  });
});

// ----- S-045: delete -----

describe("delete (S-045 AC5)", () => {
  test("answers { ok, id } and the product is gone from the list", async () => {
    const id = await insertProduct(database.db);

    expect(await post({ intent: "delete", id })).toEqual({ ok: true, id });
    expect((await load()).byType.cake).toEqual([]);
  });

  test("an unknown id is NOT_FOUND and nothing changes", async () => {
    const id = await insertProduct(database.db);

    const refused = (await post({ intent: "delete", id: "7d1f0c9e-1111-4222-8333-944455566677" })) as Refusal;

    expect(refused.init.status).toBe(404);
    expect(refused.data.error.code).toBe("NOT_FOUND");
    expect(await statusOf(id)).toBe("available");
  });

  test("an anonymous caller is redirected to sign in; nothing is deleted", async () => {
    const id = await insertProduct(database.db);

    const refused = await caught(() => post({ intent: "delete", id }, { auth: new FakeAuth() }));

    expect(refused.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu");
    expect(await statusOf(id)).toBe("available");
  });

  test("a customer session is refused with 403; nothing is deleted", async () => {
    const id = await insertProduct(database.db);
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const refused = (await caught(() => post({ intent: "delete", id }, { auth, cookie }))) as Response & { init?: { status: number } };

    expect(refused.init?.status ?? refused.status).toBe(403);
    expect(await statusOf(id)).toBe("available");
  });

  test("a Storage failure still deletes and queues the photo files (S-045 AC6)", async () => {
    const id = await insertProduct(database.db);
    await database.client.query("update product_photo set storage_path = 'products/x/a.webp' where product_id = $1", [id]);
    const failing = { remove: async () => Promise.reject(new Error("storage remove answered 503")) };

    const call = routeArgs(database, { path: "/admin/menu", auth: session.auth, cookie: session.cookie, form: { intent: "delete", id }, storage: failing });
    const result = await action(call as never);

    expect(result).toEqual({ ok: true, id });
    // The clean-up runs after the response (ADR-0003 amendment 3).
    await call.afterResponse.settled();
    expect((await database.client.query("select path from storage_purge")).rows).toEqual([{ path: "products/x/a.webp" }]);
  });
});

describe("reorder (S-042)", () => {
  const post = (form: Record<string, string | string[]>, s: { auth: FakeAuth; cookie?: string } = session) =>
    action(routeArgs(database, { path: "/admin/menu", auth: s.auth, cookie: s.cookie, form }) as never) as Promise<unknown>;
  const order = async () => (await database.client.query<{ id: string }>("select id from product where type = 'cake' order by sort_order")).rows.map((r) => r.id);

  test("AC1: an admin saves the new order and gets it back", async () => {
    const a = await insertProduct(database.db, { slug: "a", sortOrder: 0 });
    const b = await insertProduct(database.db, { slug: "b", sortOrder: 1 });

    expect(await post({ intent: "reorder", type: "cake", ids: [b, a] })).toEqual({ ok: true, type: "cake", ids: [b, a] });
    expect((await load()).byType.cake.map((r) => r.id)).toEqual([b, a]);
  });

  test("AC4: a stale list is VALIDATION_FAILED with \"The menu changed, reload\"", async () => {
    const a = await insertProduct(database.db, { slug: "a", sortOrder: 0 });
    await insertProduct(database.db, { slug: "b", sortOrder: 1 });

    const refusal = (await post({ intent: "reorder", type: "cake", ids: [a] })) as { data: { error: { code: string; fields: Record<string, string> } }; init: { status: number } };

    expect(refusal.init.status).toBe(400);
    expect(refusal.data.error).toMatchObject({ code: "VALIDATION_FAILED", fields: { ids: "The menu changed, reload." } });
  });

  test("AC6: a customer session is FORBIDDEN and an anonymous visitor is redirected; no order changes", async () => {
    const a = await insertProduct(database.db, { slug: "a", sortOrder: 0 });
    const b = await insertProduct(database.db, { slug: "b", sortOrder: 1 });
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const forbidden = (await caught(() => post({ intent: "reorder", type: "cake", ids: [b, a] }, { auth, cookie }))) as unknown as { init: { status: number } };
    const anonymous = await caught(() => post({ intent: "reorder", type: "cake", ids: [b, a] }, { auth: new FakeAuth() }));

    expect(forbidden.init.status).toBe(403);
    expect(anonymous.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu");
    expect(await order()).toEqual([a, b]);
  });
});
