import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertProduct } from "~/db/testing/catalogue";
import { confirmationContext } from "~/server/confirmation-cookie.server";
import { requestDbContext } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loader, meta, middleware } from "./order-confirmed";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  vi.restoreAllMocks();
  await database.close();
});

/** Placed at the route tests' clock (Tue 10 Nov 08:00Z), for Fri 13 (notice 3, S-083): the cookie is fresh when loaded. */
const PLACED = { now: "2026-11-10T08:00:00Z", overrides: { date: "2026-11-13" } };
const placeOrder = (basketPath = "/basket") => placeTestOrder(database, { basketPath, ...PLACED });

const load = (path: string, token: string, headers: Record<string, string> = {}, options: { now?: string; noDatabase?: boolean } = {}) => {
  const args = routeArgs(database, { path, params: { token }, now: options.now });
  if (options.noDatabase) args.context.set(requestDbContext, { db: untouchable() as never, close: async () => {} });
  const request = new Request(args.request.url, { headers });
  return loader({ ...args, request } as never);
};

/** A database that fails the test if anything reads it. */
function untouchable() {
  return new Proxy({}, { get: () => { throw new Error("the database was used"); } });
}

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

describe("items left out of the order (UX audit H1, spec AC41)", () => {
  const tartId = () => insertProduct(database.db, { slug: `tart-${Date.now()}`, nameEn: "Lemon tart", nameFr: "Tarte au citron", status: "sold_out" });

  test("the left-out cookie names the products in the page language; refreshing shows them again", async () => {
    const tart = await tartId();
    const { path, token } = await placeTestOrder(database, { basketPath: "/fr/basket" });
    const cookie = `apb_left_out=${tart}`;

    const data = (await load(path, token, { cookie })) as { leftOut: string[] };
    expect(data.leftOut).toEqual(["Tarte au citron"]);
    expect(await load(path, token, { cookie })).toEqual(data);
  });

  test("without the cookie, or with an id that is no product, nothing is named", async () => {
    const { path, token } = await placeTestOrder(database);

    expect(((await load(path, token)) as { leftOut: string[] }).leftOut).toEqual([]);
    expect(((await load(path, token, { cookie: "apb_left_out=00000000-0000-4000-8000-000000000000" })) as { leftOut: string[] }).leftOut).toEqual([]);
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

describe("right after Place order, no database (spec AC48, contracts.md v0.31)", () => {
  test("the confirmation cookie renders the same page as the database would, without touching it", async () => {
    const { path, token, confirmationCookie } = await placeOrder();
    expect(confirmationCookie).toMatch(/^apb_confirmed=/);

    const fromCookie = await load(path, token, { cookie: confirmationCookie }, { noDatabase: true });
    expect(fromCookie).toEqual(await load(path, token));
  });

  test("in French, with left-out items named, as the database path would name them", async () => {
    const tart = await insertProduct(database.db, { slug: "tart", nameEn: "Lemon tart", nameFr: "Tarte au citron", status: "sold_out" });
    const { path, token, confirmationCookie } = await placeTestOrder(database, { basketPath: "/fr/basket", extraLines: [tart], ...PLACED });
    const cookie = `${confirmationCookie}; apb_left_out=${tart}`;

    const fromCookie = (await load(path, token, { cookie }, { noDatabase: true })) as { leftOut: string[]; title: string };
    expect(fromCookie.leftOut).toEqual(["Tarte au citron"]);
    expect(fromCookie.title).toBe("Commande reçue");
    expect(fromCookie).toEqual(await load(path, token, { cookie: `apb_left_out=${tart}` }));
  });

  test("after 10 minutes, with a tampered cookie, or another order's cookie, the page reads the database", async () => {
    const first = await placeOrder();
    const second = await placeOrder();
    const tampered = first.confirmationCookie.replace("apb_confirmed=e", "apb_confirmed=f");
    expect(tampered).not.toBe(first.confirmationCookie);

    await expect(load(first.path, first.token, { cookie: first.confirmationCookie }, { now: "2026-11-10T08:10:00Z", noDatabase: true })).rejects.toThrow("the database was used");
    await expect(load(first.path, first.token, { cookie: tampered }, { noDatabase: true })).rejects.toThrow("the database was used");
    await expect(load(first.path, first.token, { cookie: second.confirmationCookie }, { noDatabase: true })).rejects.toThrow("the database was used");
    expect(await load(first.path, first.token, { cookie: tampered })).toMatchObject({ number: "APB-0001" });
  });

  test("the cookie is only trusted on its own language's path; the other language reads the database", async () => {
    const { token, confirmationCookie } = await placeOrder("/fr/basket");

    await expect(load(`/order/${token}/confirmed`, token, { cookie: `${confirmationCookie}; apb_locale=en` }, { noDatabase: true })).rejects.toThrow("the database was used");
  });

  test("without a signing secret every confirmation reads the database", async () => {
    const { path, token, confirmationCookie } = await placeOrder();
    const args = routeArgs(database, { path, params: { token } });
    args.context.set(confirmationContext, null);
    const request = new Request(args.request.url, { headers: { cookie: confirmationCookie } });

    expect(await loader({ ...args, request } as never)).toMatchObject({ number: "APB-0001" });
  });
});
