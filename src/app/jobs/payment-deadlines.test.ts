// paymentDeadlines (S-280; approve-then-pay 2026-11-14): the 12 h reminder and the 24 h unpaid
// cancel, counted from the APPROVAL (`awaiting_payment_since`), judged from the tick's injected
// clock, idempotent, against PGlite with the real migrations. The order is placed 10 hours before
// an admin approves it, so a clock counted from placing would fire 10 hours early.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { ACTIVE_STATUSES } from "~/domain/status";
import { approveOrder } from "~/server/services/approve-then-pay.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { paymentDeadlines } from "./payment-deadlines";
import type { JobContext } from "./types";

let database: TestDatabase;
let orderId: string;

const PLACED = new Date("2026-11-12T22:00:00Z");
const APPROVED = new Date("2026-11-13T08:00:00Z");
const after = (hours: number) => new Date(APPROVED.getTime() + hours * 3_600_000);

async function placeOrder(): Promise<string> {
  const { token } = await placeTestOrder(database);
  const id = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  await database.client.query("update orders set created_at = $2 where id = $1", [id, PLACED.toISOString()]);
  return id;
}

beforeEach(async () => {
  database = await createTestDatabase();
  const adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  orderId = await placeOrder();
  const approved = await approveOrder(database.db, { orderId, version: 1, adminId, now: APPROVED });
  expect(approved).toMatchObject({ ok: true, order: { status: "awaiting_payment", version: 2 } });
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
    expect(row).toMatchObject({ status: "cancelled", version: 3, cancel_reason: "unpaid" });
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
    expect((await order()).version).toBe(3);
  });

  test("an order paid before the tick is left alone", async () => {
    await database.client.query("update orders set status = 'approved', paid = true where id = $1", [orderId]);

    await run(after(30));
    expect((await order()).status).toBe("approved");
  });
});

describe("the clock counts from the approval (approve-then-pay, 2026-11-14)", () => {
  test("24 hours after placing but 14 hours after approval: a reminder, no cancel", async () => {
    await run(after(14));

    expect(await order()).toMatchObject({ status: "awaiting_payment" });
    expect(((await order()).payment_reminder_sent_at as Date).toISOString()).toBe(after(14).toISOString());
  });

  test("an order still pending approval is never reminded or cancelled, however old", async () => {
    const pending = await placeOrder();

    await run(after(72));

    expect((await database.client.query("select status, payment_reminder_sent_at from orders where id = $1", [pending])).rows[0]).toEqual({
      status: "pending_approval",
      payment_reminder_sent_at: null,
    });
    expect((await database.client.query("select id from email_outbox where order_id = $1 and template in ('payment_reminder', 'order_cancelled_unpaid')", [pending])).rows).toEqual([]);
  });

  test("an order already awaiting payment before the change (no approval instant) keeps counting from its placement", async () => {
    const legacy = await placeOrder();
    await database.client.query("update orders set status = 'awaiting_payment', awaiting_payment_since = null where id = $1", [legacy]);
    const fromPlacing = (hours: number) => new Date(PLACED.getTime() + hours * 3_600_000);

    await run(fromPlacing(24));

    expect((await database.client.query("select status, cancel_reason from orders where id = $1", [legacy])).rows[0]).toEqual({ status: "cancelled", cancel_reason: "unpaid" });
    expect((await order()).status).toBe("awaiting_payment");
  });
});
