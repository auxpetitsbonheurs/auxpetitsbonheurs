import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { requestDbContext } from "~/server/db.server";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loader, meta, middleware } from "./tracking";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type TrackingData = Exclude<Awaited<ReturnType<typeof loader>>, Response>;

function args(path: string, token: string, headers: Record<string, string> = {}) {
  const base = routeArgs(database, { path, params: { token } });
  return { ...base, request: new Request(base.request.url, { headers }) };
}

const load = async (path: string, token: string, headers: Record<string, string> = {}) =>
  (await loader(args(path, token, headers) as never)) as TrackingData;

async function rejection(promise: Promise<unknown>) {
  return promise.then(
    () => {
      throw new Error("expected the loader to throw");
    },
    (error: unknown) => error,
  );
}

describe("tracking page content (S-016 AC1)", () => {
  test("a delivery order shows number, status, paid, items, date, window, address, fee, total and Juice payment", async () => {
    const { token } = await placeTestOrder(database, { quantity: 2, overrides: DELIVERY_ORDER });

    const data = await load(`/t/${token}`, token);
    expect(data.order).toMatchObject({
      number: "APB-0001",
      status: "pending_approval",
      paid: false,
      fulfilment: "delivery",
      fulfilOn: "2026-11-12",
      dateLabel: expect.stringContaining("12"),
      window: { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
      address: "12 Royal Road, Rose Hill",
      landmark: "Opposite the church",
      itemsTotalRs: 1700,
      deliveryFeeRs: 200,
      totalRs: 1900,
      version: 1,
    });
    expect(data.order.items).toEqual([
      { name: { en: "Chocolate cake", fr: "Gâteau au chocolat" }, quantity: 2, lineTotalRs: 1700, options: [], cakeMessage: null },
    ]);
    expect(data.payment).toEqual({ juiceNumber: "5000 0000" });
  });

  test("a pickup order has no address and no fee; no Juice number means cash", async () => {
    await database.client.query("update settings set juice_number = null");
    const { token } = await placeTestOrder(database);

    const data = await load(`/t/${token}`, token);
    expect(data.order).toMatchObject({ fulfilment: "pickup", address: null, landmark: null, deliveryFeeRs: 0, totalRs: 850 });
    expect(data.payment).toEqual({ juiceNumber: null });
  });
});

describe("progress (S-016 AC2)", () => {
  test("pending is step 1 of the delivery path; approved is step 2 of the pickup path", async () => {
    const delivery = await placeTestOrder(database, { overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050" } });
    const pickup = await placeTestOrder(database);
    await database.client.query("update orders set status = 'approved' where tracking_token = $1", [pickup.token]);

    expect((await load(`/t/${delivery.token}`, delivery.token)).progress).toEqual({
      steps: ["pending_approval", "approved", "in_preparation", "out_for_delivery", "completed"],
      current: 0,
    });
    expect((await load(`/t/${pickup.token}`, pickup.token)).progress).toEqual({
      steps: ["pending_approval", "approved", "in_preparation", "ready_for_pickup", "completed"],
      current: 1,
    });
  });
});

describe("wrong, unknown and malformed tokens (S-016 AC3)", () => {
  /** A database whose `select` calls are counted, to show both 404 paths do the same work. */
  function countingDatabase() {
    const selects = vi.fn();
    const db = new Proxy(database.db, {
      get(target, key, receiver) {
        if (key === "select") selects();
        return Reflect.get(target, key, receiver);
      },
    });
    return { db, selects };
  }

  test("a wrong token and an unknown token give the identical 404 after the same single lookup", async () => {
    const { token } = await placeTestOrder(database);
    const wrong = `${token.slice(0, 42)}${token.endsWith("A") ? "B" : "A"}`;
    const unknown = "Z".repeat(43);
    const outcomes = [];
    for (const candidate of [wrong, unknown]) {
      const { db, selects } = countingDatabase();
      const call = args(`/t/${candidate}`, candidate);
      call.context.set(requestDbContext, { db: db as never, close: async () => {} });
      outcomes.push({ error: await rejection(loader(call as never)), selects: selects.mock.calls.length });
    }

    expect(outcomes[0]).toEqual(outcomes[1]);
    expect(outcomes[0]).toMatchObject({ error: { init: { status: 404 } }, selects: 1 });
  });

  test.each([
    ["short", "abc"],
    ["44 characters", "A".repeat(44)],
    ["a padding character", `${"A".repeat(42)}=`],
  ])("a %s token is a 404 before any database read", async (_label, token) => {
    const touched = vi.fn();
    const call = args(`/t/${token}`, token);
    call.context.set(requestDbContext, { db: new Proxy({}, { get: touched }) as never, close: async () => {} });

    expect(await rejection(loader(call as never))).toMatchObject({ init: { status: 404 } });
    expect(touched).not.toHaveBeenCalled();
  });
});

describe("privacy (S-016 AC4)", () => {
  test("every response is no-store, noindex and no-referrer, and the page meta is noindex", async () => {
    const response = (await middleware[0]!({} as never, async () => new Response("x"))) as Response;

    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Robots-Tag")).toContain("noindex");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(meta({ loaderData: { title: "x" } } as never)).toContainEqual({ name: "robots", content: "noindex, nofollow" });
  });

  test("the data holds nothing about any other order or customer, and no contact details", async () => {
    const other = await placeTestOrder(database, {
      overrides: { "contact.name": "Other Person", "contact.email": "other@example.com", "contact.phone": "5799 9999" },
    });
    const { token } = await placeTestOrder(database, { overrides: { "contact.note": "Ring twice" } });

    const text = JSON.stringify(await load(`/t/${token}`, token));
    for (const secret of [other.token, "APB-0001", "Other Person", "other@example.com", "aisha@example.com", "+23057123456", "Aisha", "Ring twice"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain("APB-0002");
  });
});

describe("language (S-016 AC5)", () => {
  test("a French order at /fr/t/:token is in French", async () => {
    const { token } = await placeTestOrder(database, { basketPath: "/fr/basket" });

    const data = await load(`/fr/t/${token}`, token);
    expect(data.title).toBe("Suivi de commande");
    expect(data.order.dateLabel).toMatch(/12 nov/);
  });

  test("the English link of a French order moves to /fr on entry with no remembered language", async () => {
    const { token } = await placeTestOrder(database, { basketPath: "/fr/basket" });

    const moved = (await rejection(loader(args(`/t/${token}`, token) as never))) as Response;
    expect(moved.status).toBe(302);
    expect(moved.headers.get("Location")).toBe(`/fr/t/${token}`);
    expect((await load(`/t/${token}`, token, { cookie: "apb_locale=en" })).title).toBe("Order tracking");
  });
});
