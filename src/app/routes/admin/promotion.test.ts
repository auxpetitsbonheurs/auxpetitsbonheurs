// `admin/promotion` save and `admin/promotions` list / setActive / delete (S-052, S-053, FR-063)
// through the route modules, on PGlite.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertPromotion } from "~/db/testing/promotions";
import { action as saveAction, loader as editorLoader } from "~/routes/admin/promotion";
import { action as listAction, loader as listLoader } from "~/routes/admin/promotions";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import { MemoryStorage } from "~/server/testing/memory-storage";
import { variantPath, withVariantPaths } from "~/domain/upload";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };
const NOW = "2026-11-10T08:00:00Z"; // 12:00 in Mauritius

const base = { intent: "save", id: "", "title.en": "Birthday week", "title.fr": "", "text.en": "15% off", "text.fr": "", startsAt: "2026-11-10T00:00", endsAt: "2026-11-17T00:00", active: "on", placement: "both", linkKind: "none" };

async function save(form: Record<string, string>, params: Record<string, string> = {}, role: "admin" | "owner" = "admin") {
  const session = await signedInAdmin(database, { role });
  const path = params.id ? `/admin/promotions/${params.id}` : "/admin/promotions/new";
  return (await saveAction(routeArgs(database, { path, params, auth: session.auth, cookie: session.cookie, form, now: NOW }) as never)) as unknown;
}

const rows = async () => (await database.client.query<{ id: string; title_en: string; starts_at: Date; ends_at: Date; active: boolean }>("select id, title_en, starts_at, ends_at, active from promotion")).rows;
const discounts = async () => (await database.client.query("select product_id, discount_kind, percent_off, sale_price_rs from promotion_product order by product_id")).rows;

describe("S-053 AC1, AC7: save a promotion", () => {
  test("a new promotion is stored with Mauritius times, its link and its discounts", async () => {
    const cake = await insertProduct(database.db, { basePriceRs: 1000 });
    const answer = (await save({ ...base, linkKind: "product", linkProductId: cake, [`discount.${cake}`]: "percent", [`amount.${cake}`]: "15" })) as { ok: boolean; id: string };
    expect(answer.ok).toBe(true);
    const [row] = await rows();
    expect(row!.starts_at.toISOString()).toBe("2026-11-09T20:00:00.000Z");
    expect(row!.ends_at.toISOString()).toBe("2026-11-16T20:00:00.000Z");
    expect(await discounts()).toEqual([{ product_id: cake, discount_kind: "percent", percent_off: 15, sale_price_rs: null }]);
    const link = await database.client.query("select link_kind, link_product_id from promotion");
    expect(link.rows[0]).toEqual({ link_kind: "product", link_product_id: cake });
  });

  test("an edit replaces the discounts and keeps the id", async () => {
    const cake = await insertProduct(database.db, { basePriceRs: 1000 });
    const tart = await insertProduct(database.db, { basePriceRs: 500, slug: "tart" });
    const id = await insertPromotion(database, { starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z", discounts: [{ productId: cake, percentOff: 10 }] });
    const answer = (await save({ ...base, id, [`discount.${tart}`]: "sale_price", [`amount.${tart}`]: "400" }, { id })) as { ok: boolean; id: string };
    expect(answer).toEqual({ ok: true, id });
    expect(await discounts()).toEqual([{ product_id: tart, discount_kind: "sale_price", percent_off: null, sale_price_rs: 400 }]);
  });

  test("AC9: no discounted products is allowed (banner/card only)", async () => {
    expect(((await save(base)) as { ok: boolean }).ok).toBe(true);
    expect(await discounts()).toEqual([]);
  });
});

describe("S-053 AC2, AC4: refusals save nothing", () => {
  test("an end at or before the start is refused on Ends", async () => {
    const answer = (await save({ ...base, endsAt: "2026-11-10T00:00" })) as Refusal;
    expect(answer.init.status).toBe(400);
    expect(answer.data.error.fields?.endsAt).toMatch(/end must be after the start/);
    expect(await rows()).toEqual([]);
  });

  test("percent 0 or 100, or a missing amount, is refused on that product's row", async () => {
    const cake = await insertProduct(database.db, { basePriceRs: 1000, slug: "choc", nameEn: "Chocolate cake" });
    for (const amount of ["0", "100", ""]) {
      const answer = (await save({ ...base, [`discount.${cake}`]: "percent", [`amount.${cake}`]: amount })) as Refusal;
      expect(answer.data.error.fields?.[`discounts.${cake}`], amount).toMatch(/^Offer for Chocolate cake/);
    }
    expect(await rows()).toEqual([]);
  });

  test("a missing English title and a product link with no product are both reported", async () => {
    const answer = (await save({ ...base, "title.en": " ", linkKind: "product" })) as Refusal;
    expect(Object.keys(answer.data.error.fields ?? {}).sort()).toEqual(["linkProductId", "title.en"]);
  });

  test("an id posted to the new-promotion page does not edit that promotion", async () => {
    const id = await insertPromotion(database, { title: "Kept", starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z" });
    const answer = (await save({ ...base, id })) as Refusal;
    expect(answer.data.error.code).toBe("VALIDATION_FAILED");
    expect((await rows())[0]!.title_en).toBe("Kept");
  });
});

describe("S-052: list, switch off and delete", () => {
  test("the list shows each promotion's status at the request instant and its product count", async () => {
    const cake = await insertProduct(database.db);
    await insertPromotion(database, { title: "Now", starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z", discounts: [{ productId: cake, percentOff: 10 }] });
    await insertPromotion(database, { title: "Later", starts: "2026-12-01T00:00Z", ends: "2026-12-08T00:00Z" });
    await insertPromotion(database, { title: "Paused", starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z", active: false });
    const session = await signedInAdmin(database);
    const page = await listLoader(routeArgs(database, { path: "/admin/promotions", auth: session.auth, cookie: session.cookie, now: NOW }) as never);
    expect(page.promotions[0]!.title).toBe("Later"); // newest start first
    expect(page.promotions.map((p) => [p.title, p.status, p.productCount]).sort()).toEqual([
      ["Later", "scheduled", 0],
      ["Now", "live", 1],
      ["Paused", "inactive", 0],
    ]);
  });

  test("setActive switches a promotion off; delete removes it with its discounts", async () => {
    const cake = await insertProduct(database.db);
    const id = await insertPromotion(database, { starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z", discounts: [{ productId: cake, percentOff: 10 }] });
    const session = await signedInAdmin(database);
    const post = (form: Record<string, string>) => listAction(routeArgs(database, { path: "/admin/promotions", auth: session.auth, cookie: session.cookie, form }) as never);
    expect(await post({ intent: "setActive", id, active: "false" })).toEqual({ ok: true, intent: "setActive", active: false });
    expect((await rows())[0]!.active).toBe(false);
    expect(await post({ intent: "delete", id })).toEqual({ ok: true, intent: "delete" });
    expect(await rows()).toEqual([]);
    expect(await discounts()).toEqual([]);
  });
});

test("S-052 AC4: a Live promotion cannot be deleted until it is ended", async () => {
  const id = await insertPromotion(database, { starts: "2026-11-01T00:00Z", ends: "2026-12-01T00:00Z" });
  const session = await signedInAdmin(database);
  const answer = (await listAction(routeArgs(database, { path: "/admin/promotions", auth: session.auth, cookie: session.cookie, form: { intent: "delete", id }, now: NOW }) as never)) as Refusal;
  expect(answer.data.error.fields?.id).toBe("End it first: turn it off, then delete it.");
  expect(await rows()).toHaveLength(1);
});

describe("S-053 AC10: permissions", () => {
  test("an anonymous visitor is sent to the login page", async () => {
    const answer = await editorLoader(routeArgs(database, { path: "/admin/promotions/new" }) as never).catch((r: unknown) => r);
    expect(answer).toBeInstanceOf(Response);
    expect((answer as Response).headers.get("Location")).toMatch(/^\/admin\/login/);
  });

  test("an unknown promotion id is a 404", async () => {
    const session = await signedInAdmin(database);
    const id = "00000000-0000-4000-8000-000000000000";
    const answer = await editorLoader(routeArgs(database, { path: `/admin/promotions/${id}`, params: { id }, auth: session.auth, cookie: session.cookie }) as never).catch((r: unknown) => r);
    expect((answer as { init?: { status: number } }).init?.status).toBe(404);
  });
});

describe("S-053 AC8: an optional image, with the product photo rules", () => {
  const SESSION = "6f1c1f4e-3b7a-4d5e-9c3b-2a1d0e9f8c7b";
  const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0, 0, 0, 0, 1, 2, 3]);
  const image = async () => (await database.client.query<{ image_path: string | null; image_variants: number[] }>("select image_path, image_variants from promotion")).rows[0];

  async function editor(role: "admin" | "owner" = "admin") {
    const storage = new MemoryStorage();
    const session = await signedInAdmin(database, { role });
    const path = (name: string) => `promotions/${session.admin.id}/${SESSION}/${name}.webp`;
    const put = (p: string) => storage.objects.set(`public-images/${p}`, { bytes: WEBP, contentType: "image/webp" });
    const send = async (form: Record<string, string>, params: Record<string, string> = {}) =>
      (await saveAction(
        routeArgs(database, { path: params.id ? `/admin/promotions/${params.id}` : "/admin/promotions/new", params, auth: session.auth, cookie: session.cookie, uploads: storage.gateway, storage: storage.gateway, form: { uploadSessionId: SESSION, ...form }, now: NOW }) as never,
      )) as unknown;
    return { storage, path, put, send };
  }

  test("an Admin's uploaded WebP is saved with its 480/960 copies; replacing it removes the old one and its copies", async () => {
    const { storage, path, put, send } = await editor("admin");
    const first = path("0b8e7c52-6a3f-4a1e-9d2c-5f4b3a2e1d0c");
    const second = path("1c9f8d63-7b4a-4b2f-8e3d-6a5c4b3f2e1d");
    for (const p of [first, variantPath(first, 480), variantPath(first, 960), second]) put(p);

    const created = (await send({ ...base, imagePath: first })) as { ok: true; id: string };
    expect(created.ok).toBe(true);
    expect(await image()).toEqual({ image_path: first, image_variants: [480, 960] });

    expect(await send({ ...base, id: created.id, imagePath: first }, { id: created.id })).toMatchObject({ ok: true });
    expect(await image()).toEqual({ image_path: first, image_variants: [480, 960] });
    expect(storage.removed).toEqual([]);

    expect(await send({ ...base, id: created.id, imagePath: second }, { id: created.id })).toMatchObject({ ok: true });
    expect(await image()).toEqual({ image_path: second, image_variants: [] });
    expect(storage.removed).toEqual(withVariantPaths([first]));
  });

  test("Remove clears the image and removes the file", async () => {
    const { storage, path, put, send } = await editor();
    const first = path("2d0a9e74-8c5b-4c3a-9f4e-7b6d5c4a3f2e");
    put(first);
    const created = (await send({ ...base, imagePath: first })) as { id: string };

    expect(await send({ ...base, id: created.id, imagePath: "" }, { id: created.id })).toMatchObject({ ok: true });

    expect(await image()).toEqual({ image_path: null, image_variants: [] });
    expect(storage.removed).toEqual(withVariantPaths([first]));
  });

  test("a stored file that is not an image, or a path not issued to this editor, is UPLOAD_REJECTED with a plain message; nothing is saved", async () => {
    const { storage, path, send } = await editor();
    const fake = path("3e1b0f85-9d6c-4d4b-8a5f-8c7e6d5b4a3f");
    storage.objects.set(`public-images/${fake}`, { bytes: new TextEncoder().encode("<script>alert(1)</script>"), contentType: "image/webp" });

    const notImage = (await send({ ...base, imagePath: fake })) as Refusal;
    const foreign = (await send({ ...base, imagePath: "site/00000000-0000-4000-8000-000000000000/6f1c1f4e-3b7a-4d5e-9c3b-2a1d0e9f8c7b/3e1b0f85-9d6c-4d4b-8a5f-8c7e6d5b4a3f.webp" })) as Refusal;

    for (const refused of [notImage, foreign]) {
      expect(refused.init.status).toBe(422);
      expect(refused.data.error).toMatchObject({ code: "UPLOAD_REJECTED", fields: { imagePath: "The photo could not be used. Choose it again." } });
    }
    expect(await rows()).toEqual([]);
  });

  test("deleting a promotion removes its image", async () => {
    const { storage, path, put, send } = await editor();
    const first = path("4f2c1a96-0e7d-4e5c-9b6a-9d8f7e6c5b4a");
    put(first);
    const created = (await send({ ...base, startsAt: "2026-12-01T00:00", endsAt: "2026-12-02T00:00", imagePath: first })) as { id: string };
    const session = await signedInAdmin(database);

    await listAction(routeArgs(database, { path: "/admin/promotions", auth: session.auth, cookie: session.cookie, storage: storage.gateway, form: { intent: "delete", id: created.id }, now: NOW }) as never);

    expect(await rows()).toEqual([]);
    expect(storage.removed).toEqual(withVariantPaths([first]));
  });

  test("the editor loader gives the saved image's path and public URL", async () => {
    const { path, put, send } = await editor();
    const first = path("5a3d2b07-1f8e-4f6d-8c7b-0e9a8f7d6c5b");
    put(first);
    const created = (await send({ ...base, imagePath: first })) as { id: string };
    const session = await signedInAdmin(database);

    const data = (await editorLoader(routeArgs(database, { path: `/admin/promotions/${created.id}`, params: { id: created.id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never)) as { promotion: { imagePath: string | null; imageUrl: string | null } };

    expect(data.promotion.imagePath).toBe(first);
    expect(data.promotion.imageUrl).toContain(first);
  });
});
