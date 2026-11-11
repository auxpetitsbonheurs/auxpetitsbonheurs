// `admin/menu` (S-041 list; S-043 setStatus; S-045 delete).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { loader } from "./menu";

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
