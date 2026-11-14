// Juice payment admin actions (S-279 Payment received + Undo, S-281 Refuse + Refunded),
// against PGlite with the real migrations: each action is one versioned statement that
// writes its event and outbox row with the change.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { declineOrder, markPaid, markRefunded, undoPaid } from "./order-payment.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;

const NOW = new Date("2026-11-13T10:05:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // Approve, then pay (2026-11-14): these actions start from an approved order awaiting its Juice
  // payment (approve-order.server.test covers the approval itself); the version stays 1.
  await database.client.query("update orders set status = 'awaiting_payment', awaiting_payment_since = $2 where id = $1", [orderId, "2026-11-13T08:00:00Z"]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const input = (version: number, extra: { reason?: string | null } = {}) => ({ orderId, version, adminId, now: NOW, reason: extra.reason ?? null });

async function orderRow() {
  return (
    await database.client.query<Record<string, unknown>>(
      "select status, version, paid, paid_at, paid_by, refund_due_rs, refunded_at, refunded_by, decline_reason from orders where id = $1",
      [orderId],
    )
  ).rows[0]!;
}

async function rows(sql: string) {
  return (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
}

const events = (type: string) => rows(`select actor_type, actor_admin_id, type, from_status, to_status, details from order_event where order_id = $1 and type = '${type}'`);
const outbox = (template: string) => rows(`select template, to_email, status, dedupe_key, payload from email_outbox where order_id = $1 and template = '${template}'`);

describe("Payment received (S-279 AC2)", () => {
  test("awaiting_payment becomes approved and paid, with the admin, the time, an event and the order_confirmed email", async () => {
    const result = await markPaid(database.db, input(1));

    expect(result).toEqual({ ok: true, order: { status: "approved", version: 2 } });
    expect(await orderRow()).toMatchObject({ status: "approved", version: 2, paid: true, paid_by: adminId });
    expect(((await orderRow()).paid_at as Date).toISOString()).toBe(NOW.toISOString());
    expect(await events("payment_received")).toEqual([
      { actor_type: "admin", actor_admin_id: adminId, type: "payment_received", from_status: "awaiting_payment", to_status: "approved", details: { amountRs: 850 } },
    ]);
    expect(await outbox("order_confirmed")).toEqual([
      { template: "order_confirmed", to_email: "aisha@example.com", status: "pending", dedupe_key: `order:${orderId}:order_confirmed:v2`, payload: { orderId } },
    ]);
  });

  test("a second tap on the same version is ORDER_CHANGED; on the new version INVALID_TRANSITION; one email only", async () => {
    await markPaid(database.db, input(1));

    expect(await markPaid(database.db, input(1))).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await markPaid(database.db, input(2))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await outbox("order_confirmed")).toHaveLength(1);
  });

  test("two phones at once: exactly one wins", async () => {
    const results = await Promise.all([markPaid(database.db, input(1)), markPaid(database.db, input(1))]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await events("payment_received")).toHaveLength(1);
  });

  test("an unknown order is NOT_FOUND", async () => {
    expect(await markPaid(database.db, { ...input(1), orderId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("Undo (S-279 AC3)", () => {
  test("puts the order back to awaiting payment, unpaid, logs it and withdraws the pending confirmation email", async () => {
    await markPaid(database.db, input(1));

    expect(await undoPaid(database.db, input(2))).toEqual({ ok: true, order: { status: "awaiting_payment", version: 3 } });
    expect(await orderRow()).toMatchObject({ status: "awaiting_payment", version: 3, paid: false, paid_at: null, paid_by: null });
    expect(await events("payment_undone")).toEqual([
      { actor_type: "admin", actor_admin_id: adminId, type: "payment_undone", from_status: "approved", to_status: "awaiting_payment", details: null },
    ]);
    expect((await outbox("order_confirmed")).map((r) => r.status)).toEqual(["dead"]);
  });

  test("Payment received again after an undo queues a new confirmation (new version in the key)", async () => {
    await markPaid(database.db, input(1));
    await undoPaid(database.db, input(2));

    expect((await markPaid(database.db, input(3))).ok).toBe(true);
    expect((await outbox("order_confirmed")).map((r) => r.status).sort()).toEqual(["dead", "pending"]);
  });

  test("an approved order that was not marked paid (approval path) cannot be undone", async () => {
    await database.client.query("update orders set status = 'approved' where id = $1", [orderId]);

    expect(await undoPaid(database.db, input(1))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("Refuse (S-281 AC1, AC2)", () => {
  test("an unpaid order is declined with its reason and no refund", async () => {
    expect(await declineOrder(database.db, input(1, { reason: "Our calendar is full that day." }))).toEqual({ ok: true, order: { status: "declined", version: 2 } });
    expect(await orderRow()).toMatchObject({ status: "declined", refund_due_rs: null, decline_reason: "Our calendar is full that day." });
    expect(await events("declined")).toEqual([
      { actor_type: "admin", actor_admin_id: adminId, type: "declined", from_status: "awaiting_payment", to_status: "declined", details: { refundDueRs: null } },
    ]);
    expect(await outbox("order_declined")).toHaveLength(1);
  });

  test("a paid order is declined with the whole total as the refund due", async () => {
    await markPaid(database.db, input(1));

    expect((await declineOrder(database.db, input(2, { reason: null }))).ok).toBe(true);
    expect(await orderRow()).toMatchObject({ status: "declined", paid: true, refund_due_rs: 850, decline_reason: null });
  });

  test("a completed order cannot be refused", async () => {
    await database.client.query("update orders set status = 'completed' where id = $1", [orderId]);

    expect(await declineOrder(database.db, input(1, { reason: null }))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("Refunded (S-281 AC3)", () => {
  test("records who refunded and when, logs it and queues the customer email; a second tap is refused", async () => {
    await markPaid(database.db, input(1));
    await declineOrder(database.db, input(2, { reason: null }));

    expect(await markRefunded(database.db, input(3))).toEqual({ ok: true, order: { status: "declined", version: 4 } });
    expect(await orderRow()).toMatchObject({ refund_due_rs: 850, refunded_by: adminId });
    expect(await events("refunded")).toEqual([
      { actor_type: "admin", actor_admin_id: adminId, type: "refunded", from_status: "declined", to_status: "declined", details: { amountRs: 850 } },
    ]);
    expect(await outbox("order_refunded")).toHaveLength(1);
    expect(await markRefunded(database.db, input(4))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("a declined order with nothing to refund cannot be marked refunded", async () => {
    await declineOrder(database.db, input(1, { reason: null }));

    expect(await markRefunded(database.db, input(2))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});
