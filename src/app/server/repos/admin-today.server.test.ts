// Today counts and day lists (S-120 AC1, AC2, AC4) against PGlite, checked against an
// independent count query (the epic's success measure).
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { countToday, listDayOrders } from "./admin-today.server";

let database: TestDatabase;
let customerId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  customerId = (await database.client.query<{ id: string }>("insert into customer (name, phone) values ('Today', '+23050000000') returning id")).rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function seed(number: number, status: string, on: string, start = "09:00", paid = false) {
  const window = JSON.stringify({ id: "w", start, end: "12:00", label: { en: "Slot" } });
  await database.client.query(
    `insert into orders (number, source, status, customer_id, contact_name, contact_phone, fulfilment, fulfil_on, time_window, items_total_rs, total_rs, locale, tracking_token, paid)
     values ($1, 'website', $2::order_status, $3, $4, '+23050000001', 'pickup', $5, $6, 850, 850, 'en', $7, $8)`,
    [number, status, customerId, `N${number}`, on, window, randomUUID(), paid],
  );
}

const independent = async (where: string) => Number((await database.client.query<{ n: string }>(`select count(*) as n from orders where ${where}`)).rows[0]!.n);

describe("countToday (S-120 AC1)", () => {
  test("each tile equals an independent count", async () => {
    const statuses = ["pending_approval", "quote_needed", "quote_needed", "awaiting_payment", "approved", "in_preparation", "completed", "cancelled", "declined"];
    for (const [i, status] of statuses.entries()) await seed(i + 1, status, "2026-11-10", "09:00", i === 5);

    const counts = await countToday(database.db);

    expect(counts).toEqual({
      toReview: await independent("status in ('pending_approval', 'quote_needed')"),
      quotesToSend: await independent("status = 'quote_needed'"),
      awaitingPayment: await independent("status = 'awaiting_payment'"),
      unpaid: await independent("not paid and status in ('approved', 'in_preparation', 'ready_for_pickup', 'out_for_delivery', 'completed')"),
    });
    expect(counts).toEqual({ toReview: 3, quotesToSend: 2, awaitingPayment: 1, unpaid: 2 });
  });
});

describe("listDayOrders (S-120 AC2, AC4)", () => {
  test("active orders only, by date then window start then number", async () => {
    await seed(1, "approved", "2026-11-10", "12:00");
    await seed(2, "approved", "2026-11-10", "09:00");
    await seed(3, "in_preparation", "2026-11-10", "09:00");
    await seed(4, "approved", "2026-11-11", "09:00");
    await seed(5, "cancelled", "2026-11-10", "09:00");
    await seed(6, "declined", "2026-11-10", "09:00");
    await seed(7, "approved", "2026-11-12", "09:00");

    const rows = await listDayOrders(database.db, ["2026-11-10", "2026-11-11"]);

    expect(rows.map((r) => [r.fulfilOn, r.number])).toEqual([
      ["2026-11-10", 2],
      ["2026-11-10", 3],
      ["2026-11-10", 1],
      ["2026-11-11", 4],
    ]);
  });
});
