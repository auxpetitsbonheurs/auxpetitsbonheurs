import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { resolveGuestCustomer } from "./customers.server";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const rows = async () =>
  (
    await database.client.query<{ id: string; name: string; phone: string; email: string | null; auth_user_id: string | null; locale: string }>(
      "select id, name, phone, email, auth_user_id, locale from customer order by created_at",
    )
  ).rows;

describe("guest customer matching (S-013 AC10, contracts 'Customer matching')", () => {
  test("a new email creates a new customer with the typed details", async () => {
    const id = await resolveGuestCustomer(database.db, { name: "Aisha", phone: "+23057123456", email: "aisha@example.com" }, "fr");

    expect(await rows()).toEqual([{ id, name: "Aisha", phone: "+23057123456", email: "aisha@example.com", auth_user_id: null, locale: "fr" }]);
  });

  test("an existing email (any case) attaches to that customer and never changes the row", async () => {
    const [user] = (await database.client.query<{ id: string }>(`insert into auth.users (email) values ('aisha@example.com') returning id`)).rows;
    await database.client.query(
      `insert into customer (name, phone, email, auth_user_id) values ('Aisha K', '+23050000000', 'Aisha@Example.com', $1)`,
      [user!.id],
    );
    const before = await rows();

    const id = await resolveGuestCustomer(database.db, { name: "Someone else", phone: "+23059999999", email: "aisha@example.com" }, "en");

    expect(id).toBe(before[0]!.id);
    expect(await rows()).toEqual(before);
  });

  test("a phone alone never matches: same phone, different email is a new customer", async () => {
    await database.client.query(`insert into customer (name, phone, email) values ('Aisha', '+23057123456', 'first@example.com')`);
    await database.client.query(`insert into customer (name, phone) values ('Walk-in', '+23057123456')`);

    const id = await resolveGuestCustomer(database.db, { name: "Aisha", phone: "+23057123456", email: "second@example.com" }, "en");

    const all = await rows();
    expect(all).toHaveLength(3);
    expect(all.find((r) => r.id === id)).toMatchObject({ email: "second@example.com" });
  });
});
