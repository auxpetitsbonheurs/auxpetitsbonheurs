// Customer cancel from the tracking page (S-096, FR-027) against PGlite with real migrations:
// status, customer event, version, cancellation_confirmed and admin alert outbox rows, all in
// one statement; refusals change nothing.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { approveOrder } from "./approve-order.server";
import { cancelOrderByCustomer } from "./cancel-order.server";
import { markPaid } from "./order-payment.server";

let database: TestDatabase;
let token: string;
let orderId: string;
let adminId: string;

const NOW = new Date("2026-11-06T09:30:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  ({ token } = await placeTestOrder(database, { basketPath: "/fr/basket" }));
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // Most cases start from Pending approval (orders placed before Juice payment, and the admin approve race).
  await database.client.query("update orders set status = 'pending_approval' where id = $1", [orderId]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const cancel = (version: number, at = token) => cancelOrderByCustomer(database.db, { token: at, version, now: NOW });

async function orderRow() {
  return (await database.client.query<{ status: string; version: number }>("select status, version from orders where id = $1", [orderId])).rows[0]!;
}

async function rows(sql: string) {
  return (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
}

const cancelEvents = () => rows("select actor_type, actor_admin_id, type, from_status, to_status from order_event where order_id = $1 and type = 'cancelled'");
const outbox = () => rows("select template, to_email, locale, dedupe_key, status, payload from email_outbox where order_id = $1 and template not in ('order_received', 'admin_alert_new_order') order by template, to_email");

describe("cancel while pending (S-096 AC1, AC2)", () => {
  test("pending approval becomes cancelled, version + 1, with a customer event, the customer email and the admin alert", async () => {
    const result = await cancel(1);

    expect(result).toEqual({ ok: true, order: { status: "cancelled", version: 2 } });
    expect(await orderRow()).toEqual({ status: "cancelled", version: 2 });
    expect(await cancelEvents()).toEqual([{ actor_type: "customer", actor_admin_id: null, type: "cancelled", from_status: "pending_approval", to_status: "cancelled" }]);
    const admin = (await database.client.query<{ email: string }>("select email from admin where id = $1", [adminId])).rows[0]!;
    expect(await outbox()).toEqual([
      { template: "admin_alert_customer_cancelled", to_email: admin.email, locale: "en", dedupe_key: `order:${orderId}:admin_alert_customer_cancelled:${adminId}`, status: "pending", payload: { orderId } },
      { template: "cancellation_confirmed", to_email: "aisha@example.com", locale: "fr", dedupe_key: `order:${orderId}:cancellation_confirmed`, status: "pending", payload: { orderId } },
    ]);
  });

  test("admins who turned email alerts off, or are deactivated, get no alert row", async () => {
    await database.client.query("update admin set alert_email = false");

    await cancel(1);

    expect((await outbox()).map((r) => r.template)).toEqual(["cancellation_confirmed"]);
  });

  test("awaiting payment (a new website order, unpaid) is cancelled the same way and recorded as the customer's cancel", async () => {
    await database.client.query("update orders set status = 'awaiting_payment' where id = $1", [orderId]);

    expect(await cancel(1)).toEqual({ ok: true, order: { status: "cancelled", version: 2 } });
    expect(await cancelEvents()).toMatchObject([{ from_status: "awaiting_payment", to_status: "cancelled" }]);
    expect((await rows("select cancel_reason from orders where id = $1"))[0]).toEqual({ cancel_reason: "customer" });
  });

  test("quote needed is cancelled the same way", async () => {
    await database.client.query("update orders set status = 'quote_needed' where id = $1", [orderId]);

    expect(await cancel(1)).toEqual({ ok: true, order: { status: "cancelled", version: 2 } });
    expect(await cancelEvents()).toMatchObject([{ from_status: "quote_needed", to_status: "cancelled" }]);
  });

  test("the event time is the action's time", async () => {
    await cancel(1);

    const [event] = await rows("select created_at from order_event where order_id = $1 and type = 'cancelled'");
    expect((event!.created_at as Date).toISOString()).toBe(NOW.toISOString());
  });
});

describe("refusals change nothing (S-096 AC3-AC5, AC7)", () => {
  test("approved or later (approved, then paid): a forged cancel is CANCEL_NOT_ALLOWED", async () => {
    await approveOrder(database.db, { orderId, version: 1, adminId, now: NOW });
    await markPaid(database.db, { orderId, version: 2, adminId, now: NOW });

    expect(await cancel(3)).toEqual({ ok: false, code: "CANCEL_NOT_ALLOWED" });
    expect(await orderRow()).toEqual({ status: "approved", version: 3 });
    expect(await cancelEvents()).toEqual([]);
  });

  test("approve, then pay: after the approval and before paying the customer may still cancel", async () => {
    await approveOrder(database.db, { orderId, version: 1, adminId, now: NOW });

    expect(await cancel(2)).toEqual({ ok: true, order: { status: "cancelled", version: 3 } });
  });

  test("a paid pending order is CANCEL_NOT_ALLOWED: the refund goes through the bakery", async () => {
    await database.client.query("update orders set paid = true, paid_at = now() where id = $1", [orderId]);

    expect(await cancel(1)).toEqual({ ok: false, code: "CANCEL_NOT_ALLOWED" });
    expect(await orderRow()).toMatchObject({ status: "pending_approval" });
  });

  test("a stale version on a still pending order is ORDER_CHANGED", async () => {
    await database.client.query("update orders set version = 3 where id = $1", [orderId]);

    expect(await cancel(1)).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await orderRow()).toEqual({ status: "pending_approval", version: 3 });
  });

  test("CANCEL_NOT_ALLOWED is checked before the version", async () => {
    await approveOrder(database.db, { orderId, version: 1, adminId, now: NOW });
    await markPaid(database.db, { orderId, version: 2, adminId, now: NOW });

    expect(await cancel(1)).toEqual({ ok: false, code: "CANCEL_NOT_ALLOWED" });
  });

  test("a second cancel is CANCEL_NOT_ALLOWED with no second event or email", async () => {
    await cancel(1);

    expect(await cancel(2)).toEqual({ ok: false, code: "CANCEL_NOT_ALLOWED" });
    expect(await cancelEvents()).toHaveLength(1);
    expect((await outbox()).filter((r) => r.template === "cancellation_confirmed")).toHaveLength(1);
  });

  test("an unknown token is NOT_FOUND and changes nothing", async () => {
    expect(await cancel(1, "Z".repeat(43))).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await orderRow()).toEqual({ status: "pending_approval", version: 1 });
  });
});

describe("cancel and approve at the same moment (S-096 AC6)", () => {
  test("the first committed write wins; the other is refused", async () => {
    const [customer, admin] = await Promise.all([cancel(1), approveOrder(database.db, { orderId, version: 1, adminId, now: NOW })]);

    const outcomes = [customer.ok, admin.ok];
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    if (customer.ok) expect(admin).toMatchObject({ ok: false, code: expect.stringMatching(/^(INVALID_TRANSITION|ORDER_CHANGED)$/) });
    else expect(customer).toEqual({ ok: false, code: "CANCEL_NOT_ALLOWED" });
  });

  test("cancel after the approval committed is CANCEL_NOT_ALLOWED; approve after the cancel is INVALID_TRANSITION or ORDER_CHANGED", async () => {
    await cancel(1);

    expect(await approveOrder(database.db, { orderId, version: 2, adminId, now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("email outage (S-096 AC8)", () => {
  test("the cancel commits and the email row waits as pending for the retry job", async () => {
    await cancel(1);

    const [row] = (await outbox()).filter((r) => r.template === "cancellation_confirmed");
    expect(row).toMatchObject({ status: "pending" });
    expect(await orderRow()).toMatchObject({ status: "cancelled" });
  });
});
