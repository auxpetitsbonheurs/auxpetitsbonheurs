// S-213 My orders: own orders only (G-02 filter), Current and Past, tracking links.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { routeArgs } from "~/server/testing/route-context";
import { loader } from "./orders";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(() => {
  auth = new FakeAuth();
});

afterAll(async () => {
  await database.close();
});

const session = (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:00:00Z"));
type Loaded = { current: { number: string; status: string; trackingUrl: string; total: string; fulfilOn: string }[]; past: { number: string }[] };

async function myOrders(id: string, path = "/account/orders"): Promise<Loaded> {
  return (await loader(routeArgs(database, { path, auth, cookie: session(id) }) as never)) as unknown as Loaded;
}

describe("My orders (S-213)", () => {
  test("lists the account's orders, Current and Past, with number, total, date and a tracking link (AC1, AC2, AC10)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const first = await placeTestOrder(database, { overrides: { "contact.email": customer.email } });
    await placeTestOrder(database, { overrides: { "contact.email": customer.email } });
    const third = await placeTestOrder(database, { overrides: { "contact.email": customer.email } });
    await database.client.query("update orders set status = 'completed' where tracking_token = $1", [third.token]);

    const data = await myOrders(customer.id, "/fr/account/orders");

    expect(data.current).toHaveLength(2);
    expect(data.past).toHaveLength(1);
    const card = data.current.find((o) => o.trackingUrl.endsWith(first.token));
    expect(card).toMatchObject({ status: "awaiting_payment", total: "Rs 850", trackingUrl: `/fr/t/${first.token}` });
    expect(card?.number).toMatch(/^APB-\d{4}$/);
    expect(card?.fulfilOn).toMatch(/nov/i);
  });

  test("no orders: empty lists (AC3)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    expect(await myOrders(customer.id)).toMatchObject({ current: [], past: [] });
  });

  test("another person's guest order on my row under another email is never listed (AC4, AC5)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const mine = await placeTestOrder(database, { overrides: { "contact.email": customer.email } });
    const theirs = await placeTestOrder(database, { overrides: { "contact.email": "someone@example.com" } });
    const { rows } = await database.client.query<{ id: string }>("select id from customer where auth_user_id = $1", [customer.id]);
    await database.client.query("update orders set customer_id = $1 where tracking_token = $2", [rows[0]!.id, theirs.token]);

    const data = await myOrders(customer.id);

    expect(data.current.map((o) => o.trackingUrl)).toEqual([`/t/${mine.token}`]);
  });

  test("a manual order on my row is listed even without my email (AC6)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const manual = await placeTestOrder(database, { overrides: { "contact.email": "typed-by-admin@example.com" } });
    const { rows } = await database.client.query<{ id: string }>("select id from customer where auth_user_id = $1", [customer.id]);
    await database.client.query("update orders set customer_id = $1, source = 'manual', contact_email = null where tracking_token = $2", [rows[0]!.id, manual.token]);

    expect((await myOrders(customer.id)).current).toHaveLength(1);
  });

  test("anonymous: redirected to sign-in, no data (AC5)", async () => {
    const thrown = await loader(routeArgs(database, { path: "/account/orders", auth }) as never).catch((e: unknown) => e);
    expect((thrown as Response).headers.get("Location")).toBe(`/account/sign-in?next=${encodeURIComponent("/account/orders")}`);
  });
});
