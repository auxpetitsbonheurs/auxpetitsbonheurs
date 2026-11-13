import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { BASKET_COOKIE, basketCookie, readBasketCount } from "~/server/basket.server";
import { cookieFrom, routeArgs } from "~/server/testing/route-context";
import { priceBasket } from "~/domain/menu";
import { checkoutTotals } from "~/domain/pricing";
import { signedInAdmin } from "~/server/testing/admin-session";
import { action as adminMenuAction } from "../admin/menu";
import { action, loader, middleware } from "./basket";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const cookieWith = (lines: { lineId: string; productId: string; quantity: number }[]) =>
  cookieFrom(basketCookie(lines.map((l) => ({ ...l, options: [] }))));

/** The loader's data as the view prices it (ADR-0004: lines are priced from the menu by `priceBasket`). */
async function load(cookie?: string, path = "/basket") {
  const data = await loader(routeArgs(database, { path, cookie }) as never);
  const menu = data.menu.data;
  const lines = priceBasket(data.basket, menu).map((line) => ({ ...line, imageUrl: menu.products.find((p) => p.id === line.productId)?.photos[0]?.url ?? null }));
  return { ...data, ...menu.checkout, lines, itemsTotalRs: checkoutTotals(lines, null, 0).itemsTotalRs };
}
const post = (form: Record<string, string>, cookie?: string) => action(routeArgs(database, { path: "/basket", cookie, form }) as never);

type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

describe("basket page (S-012 AC1)", () => {
  test("shows each line with name, quantity, line price and the subtotal", async () => {
    const id = await insertProduct(database.db);

    const data = await load(cookieWith([{ lineId: "a", productId: id, quantity: 2 }]));
    expect(data.lines).toHaveLength(1);
    expect(data.lines[0]).toMatchObject({
      lineId: "a",
      name: { en: "Chocolate cake", fr: "Gâteau au chocolat" },
      quantity: 2,
      unitPriceRs: 850,
      lineTotalRs: 1700,
      problem: null,
    });
    expect(data.lines[0]!.imageUrl).toBe("/images/sample/chocolate-cake.svg");
    expect(data.itemsTotalRs).toBe(1700);
  });

  test("Settings give the delivery fee, windows, pickup address and Juice number", async () => {
    const data = await load();

    expect(data.deliveryFeeRs).toBe(200);
    expect(data.pickup.address).toBe("Beau Bassin");
    expect(data.windows.delivery.map((w) => w.id)).toEqual(["morning", "afternoon", "evening"]);
    expect(data.windows.pickup.map((w) => w.id)).toEqual(["morning", "afternoon", "evening"]);
    expect(data.payment.juiceNumber).toBe("5000 0000");
  });

  test("carries the public menu with its version, and names a hidden line's product for its own basket only", async () => {
    const cake = await insertProduct(database.db);
    const hidden = await insertProduct(database.db, { slug: "gone", nameEn: "Old tart", status: "hidden" });

    const data = await load(cookieWith([{ lineId: "a", productId: cake, quantity: 1 }, { lineId: "b", productId: hidden, quantity: 1 }]));
    expect(data.menu.v).toMatch(/^m-[0-9a-f]{24}$/);
    expect(data.menu.data.products.map((p) => p.id)).toEqual([cake]);
    expect(data.goneNames).toEqual({ [hidden]: { en: "Old tart", fr: "Gâteau au chocolat" } });
    expect(data.lines.map((l) => [l.lineId, l.problem])).toEqual([["a", null], ["b", "hidden"]]);
    expect(data.itemsTotalRs).toBe(850);
    expect(data.today).toBe("2026-11-10");
  });

  test("a product the admin then hides shows as unavailable in the basket and leaves the total (S-043 AC6)", async () => {
    const cake = await insertProduct(database.db);
    const admin = await signedInAdmin(database);
    const cookie = cookieWith([{ lineId: "a", productId: cake, quantity: 1 }]);
    expect((await load(cookie)).lines[0]!.problem).toBeNull();

    await adminMenuAction(routeArgs(database, { path: "/admin/menu", auth: admin.auth, cookie: admin.cookie, form: { intent: "setStatus", id: cake, status: "hidden" } }) as never);

    const data = await load(cookie);
    expect(data.lines.map((l) => [l.lineId, l.problem])).toEqual([["a", "hidden"]]);
    expect(data.goneNames[cake]).toEqual({ en: "Chocolate cake", fr: "Gâteau au chocolat" });
    expect(data.itemsTotalRs).toBe(0);
  });

  test("a product the admin then deletes shows as unavailable (no name to show) and leaves the total (S-045 AC4)", async () => {
    const cake = await insertProduct(database.db);
    const other = await insertProduct(database.db, { slug: "lemon", nameEn: "Lemon cake" });
    const admin = await signedInAdmin(database);
    const cookie = cookieWith([{ lineId: "a", productId: cake, quantity: 1 }, { lineId: "b", productId: other, quantity: 1 }]);

    await adminMenuAction(routeArgs(database, { path: "/admin/menu", auth: admin.auth, cookie: admin.cookie, form: { intent: "delete", id: cake } }) as never);

    const data = await load(cookie);
    expect(data.lines.map((l) => [l.lineId, l.problem])).toEqual([["a", "hidden"], ["b", null]]);
    expect(data.goneNames[cake]).toBeUndefined();
    expect(data.itemsTotalRs).toBe(850);
  });

  test("an empty basket has no lines", async () => {
    const data = await load();

    expect(data.lines).toEqual([]);
    expect(data.itemsTotalRs).toBe(0);
  });
});

describe("quantity limits (S-012 AC3)", () => {
  test.each(["0", "51", "1.5", "x"])("a posted quantity of %s is VALIDATION_FAILED on the quantity field", async (quantity) => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 2 }]);

    const refused = (await post({ intent: "updateLine", lineId: "a", quantity }, cookie)) as unknown as Refusal;
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(refused.data.error.fields ?? {})).toEqual(["quantity"]);
  });

  test("1 and 50 are accepted", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 2 }]);

    for (const quantity of ["1", "50"]) {
      const response = (await post({ intent: "updateLine", lineId: "a", quantity }, cookie)) as Response;
      expect(response.headers.get("Set-Cookie")).toContain(`${BASKET_COOKIE}=`);
    }
  });

  test("an unknown intent is VALIDATION_FAILED", async () => {
    const refused = (await post({ intent: "nope" })) as unknown as Refusal;
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
  });
});

describe("changing the basket (S-012 AC4)", () => {
  test("a quantity change updates totals and the header count, and survives a reload", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);

    const response = (await post({ intent: "updateLine", lineId: "a", quantity: "3" }, cookie)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/basket");
    const next = cookieFrom(response.headers.get("Set-Cookie"));

    const reloaded = await load(next);
    expect(reloaded.lines[0]!.quantity).toBe(3);
    expect(reloaded.itemsTotalRs).toBe(2550);
    expect(readBasketCount(new Request("http://localhost/", { headers: { cookie: next } }))).toBe(3);
  });

  test("Remove takes the line out and the basket shows the rest", async () => {
    const cake = await insertProduct(database.db);
    const tart = await insertProduct(database.db, { slug: "lemon-tart", nameEn: "Lemon tart", basePriceRs: 400 });
    const cookie = cookieWith([
      { lineId: "a", productId: cake, quantity: 1 },
      { lineId: "b", productId: tart, quantity: 2 },
    ]);

    const response = (await post({ intent: "removeLine", lineId: "a" }, cookie)) as Response;
    const reloaded = await load(cookieFrom(response.headers.get("Set-Cookie")));
    expect(reloaded.lines.map((l) => l.lineId)).toEqual(["b"]);
    expect(reloaded.itemsTotalRs).toBe(800);
  });

  test("removing the last line clears the cookie", async () => {
    const id = await insertProduct(database.db);

    const response = (await post({ intent: "removeLine", lineId: "a" }, cookieWith([{ lineId: "a", productId: id, quantity: 1 }]))) as Response;
    expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  test("the French page redirects back to /fr/basket", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);

    const response = (await action(
      routeArgs(database, { path: "/fr/basket", cookie, form: { intent: "removeLine", lineId: "a" } }) as never,
    )) as Response;
    expect(response.headers.get("Location")).toBe("/fr/basket");
  });
});

describe("placeOrder from the basket page (S-013 AC11, AC2 envelope)", () => {
  const form = (overrides: Record<string, string> = {}) => ({
    intent: "placeOrder",
    idempotencyKey: "6f1c1c55-8f42-4d39-9a51-2f0d5a3f0d11",
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...overrides,
  });

  test("success clears the basket and redirects to the confirmation in the page language", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);

    const response = (await action(routeArgs(database, { path: "/fr/basket", cookie, form: form() }) as never)) as Response;
    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toMatch(/^\/fr\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    expect(response.headers.get("Set-Cookie")).toMatch(/^apb_basket=; Max-Age=0/);
    const { rows } = await database.client.query<{ locale: string }>("select locale from orders");
    expect(rows).toEqual([{ locale: "fr" }]);
  });

  test("a no-JavaScript delivery post succeeds first time: the total for the chosen fulfilment is read", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);
    // Without JavaScript the form carries one displayed total per fulfilment.
    const { displayedTotalRs: _unused, ...rest } = form();
    const delivery = {
      ...rest,
      fulfilment: "delivery",
      address: "12 Rue du Port, Beau Bassin",
      "windowId.delivery": "morning",
      "displayedTotalRs.pickup": "850",
      "displayedTotalRs.delivery": "1050",
    };
    const response = (await post(delivery, cookie)) as Response;
    expect(response.status).toBe(302);
  });

  test("a refusal is the localised envelope with field messages and the typed values", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);

    const refused = (await post(form({ "contact.phone": "12345", acceptPolicies: "" }), cookie)) as unknown as {
      data: { error: { code: string; fields: Record<string, string> }; values: Record<string, string> };
      init: { status: number; headers?: unknown };
    };
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({
      "contact.phone": "Enter a phone number, for example 5712 3456.",
      acceptPolicies: "Tick the box to accept the order policies.",
    });
    expect(refused.data.values).toMatchObject({ "contact.name": "Aisha", fulfilment: "pickup" });
    expect(refused.init.headers).toBeUndefined();
  });
});

describe("what is left out of the order (UX audit H1, H2; spec AC41, AC42)", () => {
  const form = (overrides: Record<string, string> = {}) => ({
    intent: "placeOrder",
    idempotencyKey: "5a1c1c55-8f42-4d39-9a51-2f0d5a3f0d22",
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...overrides,
  });

  test("an order placed without a sold-out line names it for the confirmation page only, with no PII in the URL", async () => {
    const cake = await insertProduct(database.db);
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", status: "sold_out" });
    const cookie = cookieWith([{ lineId: "a", productId: cake, quantity: 1 }, { lineId: "b", productId: tart, quantity: 1 }]);

    const response = (await post(form(), cookie)) as Response;

    expect(response.status).toBe(302);
    const location = response.headers.get("Location")!;
    expect(location).toMatch(/^\/order\/[A-Za-z0-9_-]{43}\/confirmed$/);
    const cookies = response.headers.getSetCookie();
    expect(cookies[0]).toMatch(/^apb_basket=; Max-Age=0/);
    expect(cookies[1]).toBe(`apb_left_out=${tart}; Max-Age=900; Path=${location.replace(/\/confirmed$/, "")}; HttpOnly; SameSite=Lax; Secure`);
  });

  test("nothing left out: no left-out cookie", async () => {
    const cake = await insertProduct(database.db);

    const response = (await post(form(), cookieWith([{ lineId: "a", productId: cake, quantity: 1 }]))) as Response;
    expect(response.headers.getSetCookie().filter((c) => c.startsWith("apb_left_out="))).toEqual([]);
  });

  test("a new order also gets the signed confirmation cookie for its own path, after the others (AC48)", async () => {
    const cake = await insertProduct(database.db);

    const response = (await post(form(), cookieWith([{ lineId: "a", productId: cake, quantity: 1 }]))) as Response;
    const path = response.headers.get("Location")!.replace(/\/confirmed$/, "");
    const cookies = response.headers.getSetCookie();
    expect(cookies).toHaveLength(2);
    expect(cookies[1]).toMatch(/^apb_confirmed=[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}; Max-Age=600; /);
    expect(cookies[1]!.endsWith(`; Path=${path}; HttpOnly; SameSite=Lax; Secure`)).toBe(true);
    expect(cookies[1]).not.toContain("aisha");
  });

  test("lines that can all not be ordered get their own message; an empty basket keeps 'Your basket is empty.'", async () => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Tart", status: "sold_out" });

    const stuck = (await post(form(), cookieWith([{ lineId: "b", productId: tart, quantity: 1 }]))) as unknown as Refusal;
    expect(stuck.data.error.fields?.basket).toBe("Nothing in your basket can be ordered right now. Remove the unavailable items or choose something else.");

    const empty = (await post(form())) as unknown as Refusal;
    expect(empty.data.error.fields?.basket).toBe("Your basket is empty.");
  });
});

describe("idempotency key in the form (S-014 AC4)", () => {
  const KEY = "0d9f8a2e-4c1b-4f6a-9e1d-7b2c3a4d5e6f";
  const form = (overrides: Record<string, string> = {}) => ({
    intent: "placeOrder",
    idempotencyKey: KEY,
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...overrides,
  });
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  test("each render of the form gets a fresh random UUID", async () => {
    const [a, b] = [await load(), await load()];

    expect(a.idempotencyKey).toMatch(uuid);
    expect(b.idempotencyKey).toMatch(uuid);
    expect(a.idempotencyKey).not.toBe(b.idempotencyKey);
  });

  test.each([
    ["a validation error", { "contact.phone": "12345" }],
    ["a price error", { displayedTotalRs: "1" }],
  ])("after %s the form re-renders with the same key and nothing is stored", async (_label, overrides) => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);

    const refused = (await post(form(overrides), cookie)) as unknown as { data: { values: Record<string, string> } };
    expect(refused.data.values.idempotencyKey).toBe(KEY);
    const { rows } = await database.client.query("select id from orders");
    expect(rows).toEqual([]);
    // The corrected submit with that key then succeeds.
    expect(((await post(form(), cookie)) as Response).status).toBe(302);
  });

  test("a key that is not a UUID is not echoed back into the form", async () => {
    const refused = (await post(form({ idempotencyKey: "<script>" }))) as unknown as { data: { values: Record<string, string>; error: { fields: Record<string, string> } } };

    expect(refused.data.values.idempotencyKey).toBeUndefined();
  });

  test("a replay after success (emptied basket, other page language) redirects to the original confirmation and changes nothing", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);
    const first = (await action(routeArgs(database, { path: "/fr/basket", cookie, form: form() }) as never)) as Response;
    const before = await database.client.query("select * from orders");

    const replay = (await post(form({ "contact.name": "Changed", displayedTotalRs: "1" }))) as Response;
    expect(replay.status).toBe(302);
    expect(replay.headers.get("Location")).toBe(first.headers.get("Location"));
    expect(replay.headers.get("Location")).toMatch(/^\/fr\/order\//);
    expect((await database.client.query("select * from orders")).rows).toEqual(before.rows);
    // The first answer's confirmation cookie (with its left-out names) is left as it is (AC48).
    expect(first.headers.getSetCookie().some((c) => c.startsWith("apb_confirmed="))).toBe(true);
    expect(replay.headers.getSetCookie().some((c) => c.startsWith("apb_confirmed="))).toBe(false);
  });

  test("a refusal sets no confirmation cookie", async () => {
    const id = await insertProduct(database.db);
    const refused = await post(form({ displayedTotalRs: "1" }), cookieWith([{ lineId: "a", productId: id, quantity: 1 }]));
    expect(refused instanceof Response ? refused.headers.getSetCookie() : []).toEqual([]);
  });
});

describe("a reused key from another submitter (threat-model G-21, tech-debt M1)", () => {
  const KEY = "3b7e1f0a-2c4d-4e5f-8a9b-0c1d2e3f4a5b";
  const form = (overrides: Record<string, string> = {}) => ({
    intent: "placeOrder",
    idempotencyKey: KEY,
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-13",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
    ...overrides,
  });
  type KeyRefusal = Refusal & { data: { values: Record<string, string>; error: { message: string } } };

  test.each([
    ["with a basket", true],
    ["after Back with an emptied basket", false],
  ])("%s: no redirect, no link, a neutral message and a fresh key in the re-rendered form", async (_label, withBasket) => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);
    const first = (await post(form(), cookie)) as Response;
    const token = /\/order\/([^/]+)\//.exec(first.headers.get("Location")!)![1]!;

    const refused = (await post(form({ "contact.email": "someone@example.com" }), withBasket ? cookie : undefined)) as unknown as KeyRefusal;

    expect(refused).not.toBeInstanceOf(Response);
    expect(refused.init.status).toBe(400);
    expect(refused.data.error.code).toBe("VALIDATION_FAILED");
    expect(refused.data.error.fields).toEqual({ form: "Please check your details and place your order again." });
    expect(refused.data.values.idempotencyKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(refused.data.values.idempotencyKey).not.toBe(KEY);
    expect(refused.data.values["contact.email"]).toBe("someone@example.com");
    expect(JSON.stringify(refused.data)).not.toContain(token);
    const { rows } = await database.client.query("select id from orders");
    expect(rows).toHaveLength(1);
  });

  test("the message is French on /fr/basket", async () => {
    const id = await insertProduct(database.db);
    const cookie = cookieWith([{ lineId: "a", productId: id, quantity: 1 }]);
    await post(form(), cookie);

    const refused = (await action(
      routeArgs(database, { path: "/fr/basket", cookie, form: form({ "contact.email": "someone@example.com" }) }) as never,
    )) as unknown as KeyRefusal;

    expect(refused.data.error.fields).toEqual({ form: "Merci de vérifier vos informations et de passer à nouveau votre commande." });
  });
});

describe("no caching (architecture Rendering, tech-debt M2)", () => {
  test("every response of the route is Cache-Control: no-store (page, data, refusal, redirect)", async () => {
    for (const response of [
      new Response("<html>"),
      new Response(null, { status: 400, headers: { "Cache-Control": "public, max-age=60" } }),
      new Response(null, { status: 302, headers: { Location: "/order/x/confirmed" } }),
    ]) {
      let result: Response | undefined;
      for (const run of middleware) result = (await run({} as never, async () => response)) as Response;
      expect(result!.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
