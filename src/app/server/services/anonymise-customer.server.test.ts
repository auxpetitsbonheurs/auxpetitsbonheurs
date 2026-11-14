// PRV-02 (privacy-2026.md, S-229 AC6; data-model "Customer personal"): the Owner's "Anonymise
// customer" removes the customer's personal data in one statement while orders and money totals
// stay, so Sales and the customer's totals are unchanged. It is idempotent and refuses while an
// order is still open. PGlite with the real migrations; the Auth Admin API is the fake.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DELETED_CUSTOMER_NAME, customerTotals } from "~/domain/customer-totals";
import type { Database } from "~/server/db.server";
import { findAdminCustomer, listCustomers } from "~/server/repos/admin-customers.server";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { anonymiseCustomer } from "./anonymise-customer.server";

let database: TestDatabase;
let users: FakeUserAdmin;
const NOW = new Date("2026-11-14T08:00:00Z");
const db = () => database.db as unknown as Database;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(() => {
  users = new FakeUserAdmin(database, new FakeAuth());
});

afterAll(async () => {
  await database.close();
});

const run = (id: string) => anonymiseCustomer({ db: db(), users, now: NOW }, id);
const one = async <T>(query: string, params: unknown[]) => (await database.client.query<T>(query, params)).rows[0]!;

/** A customer with a delivery order (completed, with notes and an edit diff), an address, a review and outbox rows. */
async function fullCustomer(email = `anna-${crypto.randomUUID().slice(0, 8)}@example.com`) {
  const id = await insertTestCustomer(database.db, { email, adminNote: "Allergic to nuts, lives near the church" });
  const delivered = await insertTestOrder(database.db, { customerId: id, fulfilment: "delivery", status: "completed", totalRs: 2400 });
  const declined = await insertTestOrder(database.db, { customerId: id, status: "declined", totalRs: 900 });
  await database.client.query("update orders set landmark = 'Blue gate', customer_note = 'Call Anna', admin_note = 'Her sister picks up', contact_email = $2 where customer_id = $1", [id, email]);
  await database.client.query(
    "insert into order_event (order_id, actor_type, type, details) values ($1, 'system', 'edited', $2)",
    [delivered.id, JSON.stringify({ diff: { contactPhone: { from: "+23057000000", to: "+23057123456" }, fulfilOn: { from: "2026-11-11", to: "2026-11-12" } }, oldTotalRs: 2400, newTotalRs: 2400 })],
  );
  await database.client.query("insert into customer_address (customer_id, address, landmark) values ($1, '12 Royal Road', 'Blue gate')", [id]);
  await database.client.query("insert into review (customer_id, rating, comment, display_name, locale) values ($1, 5, 'Lovely', 'Anna R.', 'en')", [id]);
  await database.client.query("insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key, status) values ('order_received', $2, 'en', '{\"orderId\":\"x\"}', $1, $3, 'sent')", [delivered.id, email, `t-${delivered.id}`]);
  return { id, email, delivered, declined };
}

describe("anonymiseCustomer (PRV-02, S-229 AC6)", () => {
  test("replaces name, phone, email and addresses with Deleted customer, empties notes, and keeps orders and totals", async () => {
    const anna = await fullCustomer();
    const before = await findAdminCustomer(db(), anna.id);

    expect(await run(anna.id)).toEqual({ ok: true, outcome: "anonymised" });

    expect(await one("select name, phone, email, admin_note, anonymised_at from customer where id = $1", [anna.id])).toEqual({
      name: DELETED_CUSTOMER_NAME,
      phone: DELETED_CUSTOMER_NAME,
      email: null,
      admin_note: null,
      anonymised_at: NOW,
    });
    const orders = (await database.client.query("select contact_name, contact_phone, contact_email, address, landmark, customer_note, admin_note, total_rs, status from orders where customer_id = $1 order by total_rs", [anna.id])).rows;
    expect(orders).toEqual([
      { contact_name: DELETED_CUSTOMER_NAME, contact_phone: DELETED_CUSTOMER_NAME, contact_email: null, address: null, landmark: null, customer_note: null, admin_note: null, total_rs: 900, status: "declined" },
      { contact_name: DELETED_CUSTOMER_NAME, contact_phone: DELETED_CUSTOMER_NAME, contact_email: null, address: DELETED_CUSTOMER_NAME, landmark: null, customer_note: null, admin_note: null, total_rs: 2400, status: "completed" },
    ]);
    const after = await findAdminCustomer(db(), anna.id);
    expect(customerTotals(after!.orders)).toEqual(customerTotals(before!.orders));
    expect(after!.orders.map((o) => o.id).sort()).toEqual(before!.orders.map((o) => o.id).sort());
  });

  test("removes saved addresses, the review, contact values in edit history, and the address from emails", async () => {
    const anna = await fullCustomer();

    await run(anna.id);

    expect(await one("select count(*)::int as n from customer_address where customer_id = $1", [anna.id])).toEqual({ n: 0 });
    expect(await one("select count(*)::int as n from review where customer_id = $1", [anna.id])).toEqual({ n: 0 });
    const event = await one<{ details: { diff: object; oldTotalRs: number } }>("select details from order_event where order_id = $1 and type = 'edited'", [anna.delivered.id]);
    expect(event.details).toEqual({ diff: { fulfilOn: { from: "2026-11-11", to: "2026-11-12" } }, oldTotalRs: 2400, newTotalRs: 2400 });
    expect(await one("select count(*)::int as n from email_outbox where lower(to_email) = $1", [anna.email])).toEqual({ n: 0 });
  });

  test("is idempotent: a second run changes nothing and says it was already done", async () => {
    const anna = await fullCustomer();
    await run(anna.id);
    const first = await one("select updated_at from customer where id = $1", [anna.id]);

    expect(await run(anna.id)).toEqual({ ok: true, outcome: "already" });
    expect(await one("select updated_at from customer where id = $1", [anna.id])).toEqual(first);
  });

  test("an account holder's sign-in account is deleted too; if Auth fails nothing changes and it can be retried", async () => {
    const account = await insertCustomerAccount(database, new FakeAuth());
    const { id } = await one<{ id: string }>("select id from customer where email = $1", [account.email]);
    users.deleteFails = true;

    expect(await run(id)).toEqual({ ok: false, code: "AUTH_FAILED" });
    expect(await one("select name, anonymised_at from customer where id = $1", [id])).toEqual({ name: "Cliente", anonymised_at: null });

    users.deleteFails = false;
    expect(await run(id)).toEqual({ ok: true, outcome: "anonymised" });
    expect(users.deleted).toEqual([account.id]);
    expect(await one("select auth_user_id from customer where id = $1", [id])).toEqual({ auth_user_id: null });
  });

  test("refuses while an order is still open, and says how many (nothing changes)", async () => {
    const id = await insertTestCustomer(database.db, {});
    await insertTestOrder(database.db, { customerId: id, status: "approved" });
    await insertTestOrder(database.db, { customerId: id, status: "pending_approval" });
    await insertTestOrder(database.db, { customerId: id, status: "completed" });

    expect(await run(id)).toEqual({ ok: false, code: "OPEN_ORDERS", openOrders: 2 });
    expect(await one("select anonymised_at from customer where id = $1", [id])).toEqual({ anonymised_at: null });
  });

  test("an unknown customer is NOT_FOUND", async () => {
    expect(await run(crypto.randomUUID())).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  test("the anonymised customer is out of search, shown as deleted in the list, and Sales totals are unchanged", async () => {
    const anna = await fullCustomer("findme@example.com");
    const { rows: [salesBefore] } = await database.client.query("select coalesce(sum(total_rs), 0)::int as total from orders where status = 'completed'");

    await run(anna.id);

    const found = await listCustomers(db(), { search: { text: "findme", digits: null }, sort: "name", cursor: null, limit: 20 });
    expect(found.rows).toEqual([]);
    const { rows: [salesAfter] } = await database.client.query("select coalesce(sum(total_rs), 0)::int as total from orders where status = 'completed'");
    expect(salesAfter).toEqual(salesBefore);
  });
});
