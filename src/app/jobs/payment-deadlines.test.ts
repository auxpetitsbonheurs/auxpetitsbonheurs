// paymentDeadlines (S-280): the 12 h reminder and the 24 h unpaid cancel, judged from the
// tick's injected clock, idempotent, against PGlite with the real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { ACTIVE_STATUSES } from "~/domain/status";
import { placeTestOrder } from "~/server/testing/orders";
import { paymentDeadlines } from "./payment-deadlines";
import type { JobContext } from "./types";

let database: TestDatabase;
let orderId: string;

const PLACED = new Date("2026-11-13T08:00:00Z");
const after = (hours: number) => new Date(PLACED.getTime() + hours * 3_600_000);

beforeEach(async () => {
  database = await createTestDatabase();
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set created_at = $2 where id = $1", [orderId, PLACED.toISOString()]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const run = (now: Date) => paymentDeadlines({ now, db: database.db } as unknown as JobContext);
const processed = async (now: Date) => ((await run(now)) as { processed: number }).processed;

async function order() {
  return (await database.client.query<Record<string, unknown>>("select status, version, cancel_reason, payment_reminder_sent_at from orders where id = $1", [orderId])).rows[0]!;
}

async function rows(sql: string) {
  return (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
}

describe("reminder at 12 h (S-280 AC1)", () => {
  test("nothing before 12 hours", async () => {
    expect(await run(after(11.9))).toEqual({ job: "paymentDeadlines", ran: true, processed: 0 });
    expect((await order()).payment_reminder_sent_at).toBeNull();
  });

  test("at 12 hours: marker set from the tick's clock, one system event and one payment_reminder email", async () => {
    expect(await run(after(12))).toEqual({ job: "paymentDeadlines", ran: true, processed: 1 });

    expect(((await order()).payment_reminder_sent_at as Date).toISOString()).toBe(after(12).toISOString());
    expect(await rows("select actor_type, type, to_status from order_event where order_id = $1 and type = 'payment_reminder_sent'")).toEqual([
      { actor_type: "system", type: "payment_reminder_sent", to_status: null },
    ]);
    expect(await rows("select template, to_email, status, dedupe_key from email_outbox where order_id = $1 and template = 'payment_reminder'")).toEqual([
      { template: "payment_reminder", to_email: "aisha@example.com", status: "pending", dedupe_key: `order:${orderId}:payment_reminder` },
    ]);
  });

  test("runs again later in the same window and at the same time: still one reminder (AC3)", async () => {
    await Promise.all([run(after(12)), run(after(12))]);
    await run(after(13));

    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_reminder'")).toHaveLength(1);
    expect(await rows("select id from order_event where order_id = $1 and type = 'payment_reminder_sent'")).toHaveLength(1);
  });

  test("a paid order is never reminded", async () => {
    await database.client.query("update orders set status = 'approved', paid = true where id = $1", [orderId]);

    expect(await processed(after(12))).toBe(0);
  });
});

describe("cancel at 24 h (S-280 AC2)", () => {
  test("still unpaid at 24 hours: cancelled as unpaid, version + 1, system event, email, and no longer active", async () => {
    expect(await processed(after(24))).toBe(1);

    const row = await order();
    expect(row).toMatchObject({ status: "cancelled", version: 2, cancel_reason: "unpaid" });
    expect(ACTIVE_STATUSES.has(row.status as never)).toBe(false);
    expect(await rows("select actor_type, type, from_status, to_status, details from order_event where order_id = $1 and type = 'cancelled'")).toEqual([
      { actor_type: "system", type: "cancelled", from_status: "awaiting_payment", to_status: "cancelled", details: { reason: "unpaid" } },
    ]);
    expect(await rows("select template, status from email_outbox where order_id = $1 and template = 'order_cancelled_unpaid'")).toEqual([
      { template: "order_cancelled_unpaid", status: "pending" },
    ]);
  });

  test("a missed reminder is not sent once the order is cancelled", async () => {
    await run(after(30));

    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_reminder'")).toEqual([]);
  });

  test("idempotent: concurrent and later runs cancel once (AC3)", async () => {
    await Promise.all([run(after(24)), run(after(24))]);
    expect(await processed(after(48))).toBe(0);

    expect(await rows("select id from order_event where order_id = $1 and type = 'cancelled'")).toHaveLength(1);
    expect((await order()).version).toBe(2);
  });

  test("an order paid before the tick is left alone", async () => {
    await database.client.query("update orders set status = 'approved', paid = true where id = $1", [orderId]);

    await run(after(30));
    expect((await order()).status).toBe("approved");
  });
});
