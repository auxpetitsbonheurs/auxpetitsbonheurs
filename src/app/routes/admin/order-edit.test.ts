// `admin/order-edit` loader and save (S-122 AC1, AC4, AC6, AC9; S-123 AC1 flash).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { signedInAdmin } from "~/server/testing/admin-session";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./order-edit";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;
let id: string;

const NOW = "2026-11-05T08:00:00Z";

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { name: "Sarah" });
  const { token } = await placeTestOrder(database, { overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050" } });
  id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set status = 'approved' where id = $1", [id]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const load = () => loader(routeArgs(database, { path: `/admin/orders/${id}/edit`, params: { id }, auth: session.auth, cookie: session.cookie, now: NOW }) as never);
const save = (payload: unknown, cookie = session.cookie) =>
  action(routeArgs(database, { path: `/admin/orders/${id}/edit`, params: { id }, auth: session.auth, cookie, form: { payload: JSON.stringify(payload) }, now: NOW }) as never) as Promise<unknown>;

type Refusal = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };

async function caught(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return await run();
  } catch (error) {
    return error;
  }
}

async function payload(changes: Record<string, unknown> = {}) {
  const page = await load();
  const itemId = (page.state.lines[0] as { itemId: string }).itemId;
  return {
    version: 1,
    lines: [{ itemId, quantity: 1 }],
    date: "2026-11-12",
    windowId: "morning",
    fulfilment: "delivery",
    address: "12 Royal Road, Rose Hill",
    deliveryFeeRs: 200,
    contact: { name: "Aisha", phone: "5712 3456", email: "aisha@example.com" },
    overrideTotalRs: null,
    ...changes,
  };
}

describe("edit loader (S-122 AC1, AC6)", () => {
  test("prefills items, date, window, fulfilment, address, fee and contact; the menu prices new lines", async () => {
    const page = await load();

    expect(page).toMatchObject({ editable: true, version: 1, number: "APB-0001" });
    expect(page.state).toMatchObject({
      lines: [{ kind: "kept", name: { en: "Chocolate cake" }, unitRs: 850, quantity: 1 }],
      fulfilment: { fulfilment: "delivery", date: "2026-11-12", windowId: "morning", address: "12 Royal Road, Rose Hill", deliveryFeeRs: 200 },
      contact: { name: "Aisha", email: "aisha@example.com" },
      overrideTotalRs: null,
    });
    expect(page.menu.products.length).toBeGreaterThan(0);
  });

  test("a completed order is not editable", async () => {
    await database.client.query("update orders set status = 'completed' where id = $1", [id]);

    expect((await load()).editable).toBe(false);
  });
});

describe("edit save (S-122, S-123)", () => {
  test("success redirects to the order with the flash: updated, emailed, warnings (S-123 AC1)", async () => {
    const response = (await caught(async () => save(await payload({ date: "2026-11-15" })))) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe(`/admin/orders/${id}?updated=1&emailed=1&warnings=closed`);
  });

  test("pickup → delivery without an address is VALIDATION_FAILED on the address (AC4)", async () => {
    const refused = (await save(await payload({ address: "" }))) as Refusal;

    expect(refused.init.status).toBe(400);
    expect(refused.data.error.fields).toEqual({ address: "Enter the delivery address (5 characters at least)." });
  });

  test("a free-text price over Rs 1,000,000 or a quantity over 50 is VALIDATION_FAILED on the items (AC5)", async () => {
    const big = (await save(await payload({ lines: [{ freeText: { name: "Huge", priceRs: 1_000_001, quantity: 1 } }] }))) as Refusal;
    const many = (await save(await payload({ lines: [{ freeText: { name: "Many", priceRs: 10, quantity: 51 } }] }))) as Refusal;

    expect(big.data.error.fields).toHaveProperty("lines");
    expect(many.data.error.fields).toHaveProperty("lines");
  });

  test("contact problems are named in words on their field (AC11)", async () => {
    const refused = (await save(await payload({ contact: { name: "", phone: "12" } }))) as Refusal;

    expect(refused.data.error.fields).toEqual({ "contact.name": "Enter the customer's name.", "contact.phone": "Enter a valid phone number." });
  });

  test("a stale version is ORDER_CHANGED 409 (AC9)", async () => {
    const body = await payload();
    await database.client.query("update orders set version = 2 where id = $1", [id]);

    const refused = (await save(body)) as Refusal;
    expect(refused.init.status).toBe(409);
    expect(refused.data.error.code).toBe("ORDER_CHANGED");
  });

  test("a customer cannot save (FORBIDDEN) and nothing changes", async () => {
    const body = await payload({ date: "2026-11-13" });
    const customer = await insertCustomerAccount(database, session.auth);
    const cookie = session.auth.sessionCookie(customer.id, new Date("2026-11-04T08:00:00Z"));

    const thrown = (await caught(() => save(body, cookie))) as { init?: { status: number } };
    expect(thrown.init?.status).toBe(403);
    expect((await database.client.query("select version from orders where id = $1", [id])).rows[0]).toEqual({ version: 1 });
  });
});
