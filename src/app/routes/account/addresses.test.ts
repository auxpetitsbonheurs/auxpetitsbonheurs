// S-211 saved addresses: add, default uniqueness, own rows only, delete keeps past orders.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./addresses";

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

type Envelope = { data: { ok: false; error: { code: string; fields?: Record<string, string> } }; init: { status: number } };
type Listed = { addresses: { id: string; label: string; isDefault: boolean; address: string }[] };
const session = (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:00:00Z"));

async function post(form: Record<string, string>, options: Partial<RouteArgsOptions>) {
  try {
    return await action(routeArgs(database, { path: "/account/addresses", auth, form, ...options }) as never);
  } catch (thrown) {
    return thrown;
  }
}
const list = async (id: string) => (await loader(routeArgs(database, { path: "/account/addresses", auth, cookie: session(id) }) as never)) as unknown as Listed;
const add = (id: string, label: string, isDefault = false) => post({ intent: "addAddress", label, address: `${label} street, Rose Hill`, landmark: "", ...(isDefault ? { isDefault: "on" } : {}) }, { cookie: session(id) });

describe("addresses (S-211)", () => {
  test("none yet: an empty list (AC1); added ones appear with the default first (AC2)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    expect((await list(customer.id)).addresses).toEqual([]);
    await add(customer.id, "Work");
    await add(customer.id, "Home", true);
    expect((await list(customer.id)).addresses.map((a) => [a.label, a.isDefault])).toEqual([
      ["Home", true],
      ["Work", false],
    ]);
  });

  test("a second default clears the first in the same transaction (AC3)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await add(customer.id, "Home", true);
    const work = (await add(customer.id, "Work")) as { ok: boolean };
    expect(work).toMatchObject({ ok: true });
    const workId = (await list(customer.id)).addresses.find((a) => a.label === "Work")!.id;
    await post({ intent: "updateAddress", id: workId, label: "Work", address: "Port Louis", isDefault: "on" }, { cookie: session(customer.id) });
    const defaults = (await list(customer.id)).addresses.filter((a) => a.isDefault).map((a) => a.label);
    expect(defaults).toEqual(["Work"]);
  });

  test("another customer's id: NOT_FOUND and nothing changes; anonymous is refused (AC5)", async () => {
    const owner = await insertCustomerAccount(database, auth);
    const other = await insertCustomerAccount(database, auth);
    await add(owner.id, "Home");
    const id = (await list(owner.id)).addresses[0]!.id;
    expect(((await post({ intent: "updateAddress", id, label: "Hacked", address: "x" }, { cookie: session(other.id) })) as Envelope).data.error.code).toBe("NOT_FOUND");
    expect(((await post({ intent: "deleteAddress", id }, { cookie: session(other.id) })) as Envelope).data.error.code).toBe("NOT_FOUND");
    expect(((await post({ intent: "deleteAddress", id }, {})) as Envelope).init.status).toBe(401);
    expect((await list(owner.id)).addresses[0]!.label).toBe("Home");
  });

  test("empty label or address: field errors (AC6)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const answer = (await post({ intent: "addAddress", label: " ", address: "" }, { cookie: session(customer.id) })) as Envelope;
    expect(Object.keys(answer.data.error.fields ?? {}).sort()).toEqual(["address", "label"]);
  });

  test("deleting an address leaves past orders with their own copy (AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await add(customer.id, "Home");
    const order = await placeTestOrder(database, { overrides: { ...DELIVERY_ORDER, displayedTotalRs: "1050", "contact.email": customer.email, address: "Home street, Rose Hill" } });
    await post({ intent: "deleteAddress", id: (await list(customer.id)).addresses[0]!.id }, { cookie: session(customer.id) });
    const { rows } = await database.client.query("select address from orders where tracking_token = $1", [order.token]);
    expect(rows).toEqual([{ address: "Home street, Rose Hill" }]);
  });
});
