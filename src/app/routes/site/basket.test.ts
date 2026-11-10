import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { BASKET_COOKIE, basketCookie, readBasketCount } from "~/server/basket.server";
import { cookieFrom, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./basket";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const cookieWith = (lines: { lineId: string; productId: string; quantity: number }[]) =>
  cookieFrom(basketCookie(lines.map((l) => ({ ...l, options: [] }))));

const load = (cookie?: string, path = "/basket") => loader(routeArgs(database, { path, cookie }) as never);
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
    date: "2026-11-12",
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
