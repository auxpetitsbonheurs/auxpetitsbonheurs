import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { insertProduct } from "~/db/testing/catalogue";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { requestDbContext } from "~/server/db.server";
import { cookieFrom, routeArgs } from "~/server/testing/route-context";
import { basketCookie } from "~/server/basket.server";
import { action as basketAction } from "./basket";
import { loader, meta, middleware } from "./order-confirmed";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

/** Places a real order through the basket action and returns its confirmation path. */
async function placeOrder(basketPath = "/basket"): Promise<{ path: string; token: string }> {
  const productId = await insertProduct(database.db);
  const cookie = cookieFrom(basketCookie([{ lineId: "a", productId, options: [], quantity: 1 }]));
  const form = {
    intent: "placeOrder",
    idempotencyKey: randomUUID(),
    displayedTotalRs: "850",
    fulfilment: "pickup",
    date: "2026-11-12",
    "windowId.pickup": "morning",
    "contact.name": "Aisha",
    "contact.phone": "5712 3456",
    "contact.email": "aisha@example.com",
    acceptPolicies: "on",
  };
  const response = (await basketAction(routeArgs(database, { path: basketPath, cookie, form }) as never)) as Response;
  const path = response.headers.get("Location")!;
  return { path, token: /\/order\/([^/]+)\/confirmed$/.exec(path)![1]! };
}

const load = (path: string, token: string, headers: Record<string, string> = {}) => {
  const args = routeArgs(database, { path, params: { token } });
  const request = new Request(args.request.url, { headers });
  return loader({ ...args, request } as never);
};

async function expect404(promise: Promise<unknown>) {
  const thrown = await promise.then(
    () => undefined,
    (error: unknown) => error,
  );
  expect(thrown).toMatchObject({ init: { status: 404 } });
  return thrown as { data: unknown; init: { status: number } };
}

const orderCount = async () => (await database.client.query<{ n: number }>("select count(*)::int as n from orders")).rows[0]!.n;

describe("confirmation (S-015 AC1)", () => {
  test("a valid token gives the order number and the absolute tracking URL", async () => {
    const { path, token } = await placeOrder();

    const data = (await load(path, token)) as { number: string; trackingUrl: string; offerSaveDetails: boolean };
    expect(data).toMatchObject({ number: "APB-0001", trackingUrl: `http://localhost/t/${token}`, offerSaveDetails: false });
    // Minimal slice: no contact data in the page until the Save-my-details card (E-11).
    expect(JSON.stringify(data)).not.toContain("aisha");
  });
});

describe("refresh (S-015 AC2)", () => {
  test("loading the confirmation again shows the same order and creates nothing", async () => {
    const { path, token } = await placeOrder();

    const first = await load(path, token);
    const second = await load(path, token);
    expect(second).toEqual(first);
    expect(await orderCount()).toBe(1);
  });
});

describe("wrong or malformed token (S-015 AC3)", () => {
  test("wrong and unknown valid-format tokens give the identical 404", async () => {
    const { token } = await placeOrder();
    const wrong = `${token.slice(0, 42)}${token.endsWith("A") ? "B" : "A"}`;
    const unknown = "A".repeat(43);

    const [a, b] = [await expect404(load(`/order/${wrong}/confirmed`, wrong)), await expect404(load(`/order/${unknown}/confirmed`, unknown))];
    expect(a).toEqual(b);
  });

  test.each([
    ["short", "abc"],
    ["44 characters", "A".repeat(44)],
    ["a forbidden character", `${"A".repeat(42)}=`],
  ])("a %s token is a 404 before any database read", async (_label, token) => {
    const args = routeArgs(database, { path: `/order/${token}/confirmed`, params: { token } });
    const touched = vi.fn();
    const noDatabase = new Proxy({}, { get: touched });
    args.context.set(requestDbContext, { db: noDatabase as never, close: async () => {} });

    await expect404(loader(args as never));
    expect(touched).not.toHaveBeenCalled();
  });
});

describe("headers (S-015 AC4)", () => {
  test("the route middleware makes every response no-store, noindex and no-referrer", async () => {
    const response = (await middleware[0]!({} as never, async () => new Response(null, { status: 404 }))) as Response;

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  });

  test("the page meta is noindex as well", () => {
    expect(meta({ loaderData: { title: "Order received" } } as never)).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });
});

describe("language (S-015 AC5)", () => {
  test("an order placed from /fr/basket is confirmed at /fr/... in French with a French tracking link", async () => {
    const { path, token } = await placeOrder("/fr/basket");
    expect(path).toBe(`/fr/order/${token}/confirmed`);

    const data = (await load(path, token)) as { title: string; trackingUrl: string };
    expect(data.title).toBe("Commande reçue");
    expect(data.trackingUrl).toBe(`http://localhost/fr/t/${token}`);
  });

  test("the English URL of a French order moves to French on entry when no language is remembered", async () => {
    const { token } = await placeOrder("/fr/basket");

    const thrown = (await load(`/order/${token}/confirmed`, token).catch((error: unknown) => error)) as Response;
    expect(thrown.status).toBe(302);
    expect(thrown.headers.get("Location")).toBe(`/fr/order/${token}/confirmed`);
    // Chosen English stays English.
    const data = (await load(`/order/${token}/confirmed`, token, { cookie: "apb_locale=en" })) as { title: string };
    expect(data.title).toBe("Order received");
  });
});
