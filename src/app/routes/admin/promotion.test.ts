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
