// `admin/order` loader and the approve intent (S-017 AC2, AC4, AC6).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./order";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function placed(overrides: Record<string, string> = {}, quantity = 1) {
  const { token } = await placeTestOrder(database, { overrides, quantity });
  return (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}

const load = (id: string, path = `/admin/orders/${id}`) => loader(routeArgs(database, { path, params: { id }, auth: session.auth, cookie: session.cookie }) as never);
const post = (id: string, form: Record<string, string>) =>
  action(routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: session.auth, cookie: session.cookie, form }) as never) as Promise<unknown>;

type Refusal = { data: { ok: false; error: { code: string; message: string } }; init: { status: number } };

async function caughtStatus(run: () => unknown): Promise<number> {
  try {
    await run();
  } catch (error) {
    return (error as { init?: { status: number }; status?: number }).init?.status ?? (error as Response).status;
  }
  throw new Error("expected a thrown 404");
}

describe("order detail (S-017 AC2)", () => {
  test("shows items, contact, fulfilment and address, date, window, total, status and version", async () => {
    const id = await placed({ ...DELIVERY_ORDER, "contact.note": "Ring twice" }, 2);

    const page = await load(id);

    expect(page.order).toMatchObject({
      id,
      number: "APB-0001",
      status: "pending_approval",
      source: "website",
      version: 1,
      fulfilment: "delivery",
      address: "12 Royal Road, Rose Hill",
      landmark: "Opposite the church",
      fulfilOn: "2026-11-12",
      dateLabel: "Thu 12 Nov",
      window: { id: "morning", start: "09:00", end: "12:00", label: { en: "Morning", fr: "Matin" } },
      itemsTotalRs: 1700,
      deliveryFeeRs: 200,
      totalRs: 1900,
      paid: false,
      customerNote: "Ring twice",
      locale: "en",
      items: [{ name: { en: "Chocolate cake", fr: "Gâteau au chocolat" }, quantity: 2, unitPriceRs: 850, lineTotalRs: 1700, options: [], cakeMessage: null }],
    });
    expect(page.customer).toEqual({ name: "Aisha", phone: "+23057123456", email: "aisha@example.com" });
    expect(page.telUrl).toBe("tel:+23057123456");
    expect(page.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=12%20Royal%20Road%2C%20Rose%20Hill");
    expect(page.allowed).toEqual({ approve: true });
  });

  test("pickup has no maps link; an approved order no longer allows approve", async () => {
    const id = await placed();
    await database.client.query("update orders set status = 'approved', version = 2 where id = $1", [id]);

    const page = await load(id);

    expect(page.mapsUrl).toBeNull();
    expect(page.allowed).toEqual({ approve: false });
    expect(page.order.version).toBe(2);
  });

  test.each([
    ["an unknown id", "7d1f0c9e-1111-4222-8333-944455566677"],
    ["a malformed id", "not-a-uuid"],
  ])("%s is a 404", async (_label, id) => {
    expect(await caughtStatus(() => load(id))).toBe(404);
  });
});

describe("approve intent", () => {
  test("success returns the new status and version (S-017 AC3)", async () => {
    const id = await placed();

    expect(await post(id, { intent: "approve", version: "1" })).toEqual({ ok: true, order: { status: "approved", version: 2 } });
  });

  test("a stale version is ORDER_CHANGED 409 \"This order changed. Reload\" (AC4)", async () => {
    const id = await placed();
    await database.client.query("update orders set version = 4 where id = $1", [id]);

    const refused = (await post(id, { intent: "approve", version: "3" })) as Refusal;

    expect(refused.init.status).toBe(409);
    expect(refused.data.error).toEqual({ code: "ORDER_CHANGED", message: "This order changed. Reload" });
  });

  test("approving an approved order is INVALID_TRANSITION 409 (AC6)", async () => {
    const id = await placed();
    await post(id, { intent: "approve", version: "1" });

    const refused = (await post(id, { intent: "approve", version: "2" })) as Refusal;

    expect(refused.init.status).toBe(409);
    expect(refused.data.error.code).toBe("INVALID_TRANSITION");
  });

  test.each([
    ["no version", { intent: "approve" }],
    ["a version of 0", { intent: "approve", version: "0" }],
    ["an unknown intent", { intent: "decline", version: "1" }],
  ])("%s is VALIDATION_FAILED and changes nothing", async (_label, form) => {
    const id = await placed();

    expect(((await post(id, form)) as Refusal).init.status).toBe(400);
    expect((await database.client.query("select status from orders where id = $1", [id])).rows).toEqual([{ status: "pending_approval" }]);
  });

  test("the French admin gets French refusals", async () => {
    const french = await signedInAdmin(database, { locale: "fr" });
    const id = await placed();
    await database.client.query("update orders set version = 2 where id = $1", [id]);

    const refused = (await action(
      routeArgs(database, { path: `/admin/orders/${id}`, params: { id }, auth: french.auth, cookie: french.cookie, form: { intent: "approve", version: "1" } }) as never,
    )) as Refusal;

    expect(refused.data.error.message).toBe("Cette commande a changé. Rechargez");
  });
});
