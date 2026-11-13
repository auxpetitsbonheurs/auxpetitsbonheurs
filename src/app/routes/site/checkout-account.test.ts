// E-11 S-212: signed-in checkout. Prefilled details (AC1), never gated (AC5), the order attached to
// the customer's own row whatever email was typed, and listed in My orders (AC6, coordinator
// decision 2026-11-13); guests keep the email match (contracts "Customer matching").
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { loader as ordersLoader } from "~/routes/account/orders";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { addAddress } from "~/server/repos/customer-addresses.server";
import { routeArgs } from "~/server/testing/route-context";
import { loader as basketLoader } from "./basket";

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

const session = (id: string) => `apb_customer=1; ${auth.sessionCookie(id, new Date("2026-11-05T07:00:00Z"))}`;

async function rowOf(token: string) {
  const { rows } = await database.client.query<{ customer_id: string; contact_email: string; by_account: boolean }>("select customer_id, contact_email, by_account from orders where tracking_token = $1", [token]);
  return rows[0]!;
}

describe("signed-in checkout (S-212)", () => {
  test("the basket prefills name, phone and email for a signed-in customer; a guest gets none (AC1)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const signedIn = (await basketLoader(routeArgs(database, { path: "/basket", auth, cookie: session(customer.id) }) as never)) as { prefill: unknown };
    const guest = (await basketLoader(routeArgs(database, { path: "/basket", auth }) as never)) as { prefill: unknown };
    expect(signedIn.prefill).toEqual({ "contact.name": "Cliente", "contact.phone": "+23057000000", "contact.email": customer.email });
    expect(guest.prefill).toBeNull();
  });

  test("a different typed email: the order is on the customer's own row, the snapshot keeps the typed email, My orders lists it (AC6)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const order = await placeTestOrder(database, { auth, extraCookie: session(customer.id), now: "2026-11-05T08:00:00Z", overrides: { "contact.email": "typed-other@example.com" } });

    const row = await rowOf(order.token);
    const { rows } = await database.client.query<{ id: string; email: string }>("select id, email from customer where auth_user_id = $1", [customer.id]);
    expect(row).toEqual({ customer_id: rows[0]!.id, contact_email: "typed-other@example.com", by_account: true });
    expect(rows[0]!.email).toBe(customer.email);
    expect((await database.client.query("select 1 from customer where email = 'typed-other@example.com'")).rows).toEqual([]);

    const mine = (await ordersLoader(routeArgs(database, { path: "/account/orders", auth, cookie: session(customer.id) }) as never)) as { current: { trackingUrl: string }[] };
    expect(mine.current.map((o) => o.trackingUrl)).toEqual([`/t/${order.token}`]);
  });

  test("a guest still matches by email and is never marked by_account; a stale hint without a session is a guest", async () => {
    const guest = await placeTestOrder(database, { overrides: { "contact.email": "guest-only@example.com" } });
    const stale = await placeTestOrder(database, { auth, extraCookie: "apb_customer=1", overrides: { "contact.email": "stale-hint@example.com" } });
    for (const token of [guest.token, stale.token]) expect((await rowOf(token)).by_account).toBe(false);
  });
});

describe("saved addresses at checkout (S-212 AC2, AC3, AC4, AC7)", () => {
  const delivery = (extra: Record<string, string>) => ({ ...DELIVERY_ORDER, displayedTotalRs: "1050", ...extra });
  async function customerRow(authId: string) {
    const { rows } = await database.client.query<{ id: string }>("select id from customer where auth_user_id = $1", [authId]);
    return rows[0]!.id;
  }

  test("the loader offers the customer's addresses, default first; a guest gets none (AC2, AC7)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const id = await customerRow(customer.id);
    await addAddress(database.db as never, id, { label: "Work", address: "Port Louis", landmark: null, isDefault: false });
    await addAddress(database.db as never, id, { label: "Home", address: "Rose Hill", landmark: "Church", isDefault: true });
    const data = (await basketLoader(routeArgs(database, { path: "/basket", auth, cookie: session(customer.id) }) as never)) as { savedAddresses: { label: string }[] };
    expect(data.savedAddresses.map((a) => a.label)).toEqual(["Home", "Work"]);
    const guest = (await basketLoader(routeArgs(database, { path: "/basket", auth }) as never)) as { savedAddresses: unknown };
    expect(guest.savedAddresses).toBeNull();
  });

  test("a chosen saved address is the order's address; another customer's id is ignored (AC2, AC6)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const other = await insertCustomerAccount(database, auth);
    const mine = await addAddress(database.db as never, await customerRow(customer.id), { label: "Home", address: "1 Saved Street", landmark: "Blue gate", isDefault: true });
    const theirs = await addAddress(database.db as never, await customerRow(other.id), { label: "Theirs", address: "9 Secret Road", landmark: null, isDefault: true });

    const a = await placeTestOrder(database, { auth, extraCookie: session(customer.id), overrides: delivery({ savedAddressId: mine.id, "contact.email": customer.email }) });
    const b = await placeTestOrder(database, { auth, extraCookie: session(customer.id), overrides: delivery({ savedAddressId: theirs.id, "contact.email": customer.email }) });

    const rows = await database.client.query<{ tracking_token: string; address: string; landmark: string | null }>("select tracking_token, address, landmark from orders where tracking_token = any($1)", [[a.token, b.token]]);
    const byToken = Object.fromEntries(rows.rows.map((r) => [r.tracking_token, r]));
    expect(byToken[a.token]).toMatchObject({ address: "1 Saved Street", landmark: "Blue gate" });
    expect(byToken[b.token]).toMatchObject({ address: DELIVERY_ORDER.address });
  });

  test("a typed address is saved after the order only when ticked; the first becomes the default (AC3)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await placeTestOrder(database, { auth, extraCookie: session(customer.id), overrides: delivery({ savedAddressId: "new", "contact.email": customer.email }) });
    const id = await customerRow(customer.id);
    expect((await database.client.query("select 1 from customer_address where customer_id = $1", [id])).rows).toEqual([]);

    await placeTestOrder(database, { auth, extraCookie: session(customer.id), overrides: delivery({ savedAddressId: "new", saveAddress: "on", address: "5 New Lane, Quatre Bornes", "contact.email": customer.email }) });
    const { rows } = await database.client.query("select label, address, is_default from customer_address where customer_id = $1", [id]);
    expect(rows).toEqual([{ label: "5 New Lane", address: "5 New Lane, Quatre Bornes", is_default: true }]);
  });

  test("pickup never uses or saves an address (AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await placeTestOrder(database, { auth, extraCookie: session(customer.id), overrides: { saveAddress: "on", address: "Should not save", "contact.email": customer.email } });
    const id = await customerRow(customer.id);
    expect((await database.client.query("select 1 from customer_address where customer_id = $1", [id])).rows).toEqual([]);
  });
});

