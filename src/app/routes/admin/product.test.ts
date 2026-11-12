// `admin/product` loader and save (S-046).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./product";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Session = { auth: FakeAuth; cookie?: string };
const load = (path: string, params: Record<string, string> = {}, s: Session = session) =>
  loader(routeArgs(database, { path, params, auth: s.auth, cookie: s.cookie }) as never);
const post = (path: string, form: Record<string, string>, params: Record<string, string> = {}, s: Session = session) =>
  action(routeArgs(database, { path, params, auth: s.auth, cookie: s.cookie, form }) as never) as Promise<unknown>;

const NEW = { intent: "save", "name.en": "Pistachio cake", basePriceRs: "850", type: "cake", status: "hidden" };
type Refusal = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

async function caught(run: () => unknown): Promise<Response & { init?: { status: number } }> {
  try {
    await run();
  } catch (error) {
    return error as Response;
  }
  throw new Error("expected a thrown response");
}

describe("loader", () => {
  test("a new product: no product, the type from ?type=, allergen chips and the Settings defaults", async () => {
    const page = await load("/admin/menu/new?type=dessert");

    expect(page).toMatchObject({ title: "New product", product: null, newType: "dessert", previewUrl: null, settingsDefaults: { noticeDays: 3, cakeMessageMax: 40 } });
    expect(page.allergenTags).toEqual(["eggless", "nut_free", "gluten_free", "dairy_free"]);
  });

  test("an existing product with its fields and category suggestions", async () => {
    const id = await insertProduct(database.db, { category: "Birthday", allergens: ["eggless"], noticeDays: 5 });

    const page = await load(`/admin/menu/${id}`, { id });

    expect(page.product).toMatchObject({ id, slug: "chocolate-cake", name: { en: "Chocolate cake" }, basePriceRs: 850, noticeDays: 5, allergens: ["eggless"], photoCount: 1, updated: null });
    expect(page.categories).toEqual(["Birthday"]);
    // S-047: photos in card order with their public URL (bundled sample paths are used as is).
    expect(page.product!.photos).toEqual([{ path: "/images/sample/chocolate-cake.svg", url: "/images/sample/chocolate-cake.svg", width: 800, height: 600 }]);
  });

  test("shows who saved last and when (S-046 AC7)", async () => {
    const created = (await post("/admin/menu/new", NEW)) as { id: string };

    const page = await load(`/admin/menu/${created.id}`, { id: created.id });

    expect(page.product!.updated).toEqual({ name: "Sarah", at: "2026-11-10T08:00:00.000Z" });
  });

  test.each([["unknown", "7d1f0c9e-1111-4222-8333-944455566677"], ["malformed", "nope"]])("an %s id is a 404", async (_label, id) => {
    expect((await caught(() => load(`/admin/menu/${id}`, { id }))).init?.status).toBe(404);
  });
});

describe("save (S-046 AC1, AC3)", () => {
  test("creates the product and answers { ok, id, slug }", async () => {
    const result = (await post("/admin/menu/new", NEW)) as { ok: true; id: string; slug: string };

    expect(result).toMatchObject({ ok: true, slug: "pistachio-cake" });
    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("the edit URL's id is the product saved, whatever id is posted", async () => {
    const id = await insertProduct(database.db, { status: "hidden" });

    await post(`/admin/menu/${id}`, { ...NEW, id: "7d1f0c9e-1111-4222-8333-944455566677" }, { id });

    const name = await database.client.query("select name_en from product where id = $1", [id]);
    expect(name.rows[0]).toEqual({ name_en: "Pistachio cake" });
  });

  test("a refusal is VALIDATION_FAILED 400 with a message for each field, in the admin's language", async () => {
    const refused = (await post("/admin/menu/new", { ...NEW, "name.en": "", basePriceRs: "-5" })) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ "name.en": "Enter the English name.", basePriceRs: "Enter the price in whole rupees, for example 850." });
  });

  test("a taken slug is SLUG_TAKEN 409 on fields.slug (S-046 AC5)", async () => {
    await insertProduct(database.db, { slug: "pistachio-cake" });

    const refused = (await post("/admin/menu/new", NEW)) as Refusal;

    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toMatchObject({ code: "SLUG_TAKEN", fields: { slug: "This web address is already used. Choose another." } });
  });

  test("French admin gets French messages", async () => {
    const french = await signedInAdmin(database, { locale: "fr" });

    const refused = (await post("/admin/menu/new", { ...NEW, "name.en": "" }, {}, french)) as Refusal;

    expect(refused.data.error.fields).toEqual({ "name.en": "Saisissez le nom en anglais." });
  });

  test("an unknown intent is VALIDATION_FAILED", async () => {
    expect(((await post("/admin/menu/new", { ...NEW, intent: "publish" })) as Refusal).init.status).toBe(400);
  });
});

describe("who may save (S-046 AC8)", () => {
  test("an Admin (not only an Owner) can save", async () => {
    const helper = await signedInAdmin(database, { role: "admin" });

    expect(await post("/admin/menu/new", NEW, {}, helper)).toMatchObject({ ok: true });
  });

  test("an anonymous visitor is redirected to sign in and nothing is saved", async () => {
    const refused = await caught(() => post("/admin/menu/new", NEW, {}, { auth: new FakeAuth() }));

    expect(refused.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Fmenu%2Fnew");
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 0 });
  });

  test("a customer session is refused (403) and nothing is saved", async () => {
    const auth = new FakeAuth();
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z"));

    const refused = await caught(() => post("/admin/menu/new", NEW, {}, { auth, cookie }));

    expect(refused.init?.status ?? refused.status).toBe(403);
    expect((await database.client.query("select count(*)::int as n from product")).rows[0]).toEqual({ n: 0 });
  });
});
