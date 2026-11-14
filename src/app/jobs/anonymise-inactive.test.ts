// PRV-02 (privacy-2026.md; data-model "Customer personal"): once a month the retention job
// anonymises guests whose last order is older than RETENTION.orderYears (5, proposed, not yet
// confirmed by the Owner), with the same statement as the Owner's action. Fixed clock.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { RETENTION } from "~/domain/privacy-facts";
import { insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { insertTestCustomer, insertTestOrder } from "~/server/testing/sales";
import { anonymiseInactive, retentionCutoff } from "./anonymise-inactive";
import type { JobContext } from "./types";

let database: TestDatabase;
// Sun 1 Nov 2026, 04:10 in Mauritius (UTC+4): the first day of a month.
const FIRST_OF_MONTH = new Date("2026-11-01T00:10:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const run = (now: Date, batch?: number) => anonymiseInactive({ now, db: database.db } as unknown as JobContext, batch);
const anonymised = async (id: string) => (await database.client.query<{ a: boolean }>("select anonymised_at is not null as a from customer where id = $1", [id])).rows[0]!.a;

/** A guest whose only order was created and fulfilled on `day` (YYYY-MM-DD, Mauritius). */
async function guestLastOrderedOn(day: string, status: "completed" | "approved" = "completed"): Promise<string> {
  const id = await insertTestCustomer(database.db, {});
  await database.client.query("update customer set created_at = $2 where id = $1", [id, `${day}T08:00:00Z`]);
  await insertTestOrder(database.db, { customerId: id, status, fulfilOn: day, createdAt: new Date(`${day}T06:00:00Z`) });
  return id;
}

describe("anonymiseInactive (PRV-02 retention job)", () => {
  test("the period is the one the privacy note states: 5 years before today (Mauritius)", () => {
    expect(RETENTION.orderYears).toBe(5);
    expect(retentionCutoff(FIRST_OF_MONTH).toISOString()).toBe("2021-10-31T20:00:00.000Z"); // 1 Nov 2021 00:00 MU
  });

  test("anonymises a guest whose last order is more than 5 years old; keeps one inside the period", async () => {
    const old = await guestLastOrderedOn("2021-10-30");
    const recent = await guestLastOrderedOn("2021-11-02");

    expect(await run(FIRST_OF_MONTH)).toEqual({ job: "anonymiseInactive", ran: true, processed: 1 });

    expect(await anonymised(old)).toBe(true);
    expect(await anonymised(recent)).toBe(false);
    expect((await database.client.query("select total_rs, status from orders where customer_id = $1", [old])).rows).toEqual([{ total_rs: 1000, status: "completed" }]);
  });

  test("a newer order (or a far-future fulfil date) keeps the customer; an open order always does", async () => {
    const returning = await guestLastOrderedOn("2019-05-01");
    await insertTestOrder(database.db, { customerId: returning, fulfilOn: "2024-02-01", createdAt: new Date("2024-01-20T06:00:00Z") });
    const stuck = await guestLastOrderedOn("2020-03-01", "approved");

    expect(await run(FIRST_OF_MONTH)).toMatchObject({ processed: 0 });
    expect(await anonymised(returning)).toBe(false);
    expect(await anonymised(stuck)).toBe(false);
  });

  test("an account holder is kept (accounts last until deleted, PRV-04)", async () => {
    const account = await insertCustomerAccount(database, new FakeAuth());
    const { rows } = await database.client.query<{ id: string }>("update customer set created_at = '2019-01-01' where email = $1 returning id", [account.email]);
    await insertTestOrder(database.db, { customerId: rows[0]!.id, fulfilOn: "2019-01-05", createdAt: new Date("2019-01-02T06:00:00Z") });

    expect(await run(FIRST_OF_MONTH)).toMatchObject({ processed: 0 });
  });

  test("a guest row with no order at all is judged by when it was created", async () => {
    const id = await insertTestCustomer(database.db, {});
    await database.client.query("update customer set created_at = '2020-01-01' where id = $1", [id]);

    expect(await run(FIRST_OF_MONTH)).toMatchObject({ processed: 1 });
  });

  test("runs only on the 1st of the month (each hourly tick that day, in batches), and is idempotent", async () => {
    const ids = [await guestLastOrderedOn("2020-01-01"), await guestLastOrderedOn("2020-02-01"), await guestLastOrderedOn("2020-03-01")];

    expect(await run(new Date("2026-11-02T00:10:00Z"))).toEqual({ job: "anonymiseInactive", ran: true, processed: 0 });
    expect(await run(FIRST_OF_MONTH, 2)).toMatchObject({ processed: 2 });
    expect(await run(new Date(FIRST_OF_MONTH.getTime() + 3_600_000), 2)).toMatchObject({ processed: 1 });
    expect(await run(new Date(FIRST_OF_MONTH.getTime() + 7_200_000), 2)).toMatchObject({ processed: 0 });
    for (const id of ids) expect(await anonymised(id)).toBe(true);
  });
});
