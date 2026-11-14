// Approve (S-017 AC3-AC6) and its activity-log event in the same transaction (S-018 AC4),
// against the in-process Postgres (PGlite) with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { approveOrder } from "./approve-order.server";
import { markPaid } from "./approve-then-pay.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;

const NOW = new Date("2026-11-12T10:05:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  const { token } = await placeTestOrder(database, { basketPath: "/fr/basket" });
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // Approve, then pay (2026-11-14): place_order leaves a website order in pending_approval.
  expect((await database.client.query("select status from orders where id = $1", [orderId])).rows[0]).toEqual({ status: "pending_approval" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

const approve = (version: number, id = orderId) => approveOrder(database.db, { orderId: id, version, adminId, now: NOW });

async function orderRow() {
  return (await database.client.query<{ status: string; version: number }>("select status, version from orders where id = $1", [orderId])).rows[0]!;
}

async function rows(sql: string) {
  return (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
}

describe("approve, then pay (S-017 AC3; Owner decision 2026-11-14)", () => {
  test("pending_approval becomes awaiting_payment, version + 1, with an approved event and a payment_instructions outbox row", async () => {
    const result = await approve(1);

    expect(result).toEqual({ ok: true, order: { status: "awaiting_payment", version: 2, paid: false } });
    expect(await orderRow()).toEqual({ status: "awaiting_payment", version: 2 });
    const events = await rows("select actor_type, actor_admin_id, type, from_status, to_status from order_event where order_id = $1 and type = 'approved'");
    expect(events).toEqual([{ actor_type: "admin", actor_admin_id: adminId, type: "approved", from_status: "pending_approval", to_status: "awaiting_payment" }]);
    const outbox = await rows("select template, to_email, locale, dedupe_key, status, payload from email_outbox where order_id = $1 and template = 'payment_instructions'");
    expect(outbox).toEqual([
      { template: "payment_instructions", to_email: "aisha@example.com", locale: "fr", dedupe_key: `order:${orderId}:payment_instructions:v2`, status: "pending", payload: { orderId } },
    ]);
    // Not confirmed yet: Payment received sends order_confirmed.
    expect(await rows("select id from email_outbox where order_id = $1 and template = 'order_confirmed'")).toEqual([]);
  });

  test("the payment clock starts at the approval and its one reminder is re-armed", async () => {
    await database.client.query("update orders set payment_reminder_sent_at = '2026-11-01T00:00:00Z' where id = $1", [orderId]);

    await approve(1);

    const [row] = await rows("select awaiting_payment_since, payment_reminder_sent_at, paid from orders where id = $1");
    expect((row!.awaiting_payment_since as Date).toISOString()).toBe(NOW.toISOString());
    expect(row).toMatchObject({ payment_reminder_sent_at: null, paid: false });
  });

  test("Payment received after the approval confirms the order (approved, paid) and queues order_confirmed", async () => {
    await approve(1);

    expect(await markPaid(database.db, { orderId, version: 2, adminId, now: new Date("2026-11-12T12:00:00Z") })).toEqual({ ok: true, order: { status: "approved", version: 3 } });
    expect(await rows("select paid from orders where id = $1")).toEqual([{ paid: true }]);
    // Outbox ids are random: the version in each dedupe key shows the order (approval v2, payment v3).
    expect(await rows("select template, dedupe_key from email_outbox where order_id = $1 and template in ('payment_instructions', 'order_confirmed') order by template")).toEqual([
      { template: "order_confirmed", dedupe_key: `order:${orderId}:order_confirmed:v3` },
      { template: "payment_instructions", dedupe_key: `order:${orderId}:payment_instructions:v2` },
    ]);
  });

  test("the event time is the action's time", async () => {
    await approve(1);

    const [event] = await rows("select created_at from order_event where order_id = $1 and type = 'approved'");
    expect((event!.created_at as Date).toISOString()).toBe(NOW.toISOString());
  });
});

describe("conflicts (S-017 AC4, AC5)", () => {
  test("a stale version is ORDER_CHANGED and changes nothing", async () => {
    await database.client.query("update orders set version = 4 where id = $1", [orderId]);

    expect(await approve(3)).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await orderRow()).toEqual({ status: "pending_approval", version: 4 });
    expect(await rows("select id from order_event where order_id = $1 and type = 'approved'")).toEqual([]);
    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_instructions'")).toEqual([]);
  });

  test("two simultaneous approvals with the same version: exactly one succeeds and one outbox row exists", async () => {
    const results = await Promise.all([approve(1), approve(1), approve(1)]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([
      { ok: false, code: "ORDER_CHANGED" },
      { ok: false, code: "ORDER_CHANGED" },
    ]);
    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_instructions'")).toHaveLength(1);
    expect(await rows("select id from order_event where order_id = $1 and type = 'approved'")).toHaveLength(1);
    expect(await orderRow()).toEqual({ status: "awaiting_payment", version: 2 });
  });
});

describe("invalid transition and unknown order (S-017 AC6, AC7)", () => {
  test.each(["awaiting_payment", "approved", "cancelled", "quote_needed"])("an order in %s with its current version is INVALID_TRANSITION and unchanged", async (status) => {
    await database.client.query("update orders set status = $2 where id = $1", [orderId, status]);

    expect(await approve(1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await orderRow()).toEqual({ status, version: 1 });
    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_instructions'")).toEqual([]);
  });

  test("an unknown order id is NOT_FOUND", async () => {
    expect(await approve(1, "7d1f0c9e-1111-4222-8333-944455566677")).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("one transaction (S-018 AC4)", () => {
  test("when the outbox insert fails, the status change and the event roll back together", async () => {
    await database.client.exec(`
      create function fail_outbox() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger fail_outbox before insert on email_outbox for each row execute function fail_outbox();`);

    await expect(approve(1)).rejects.toThrow();

    expect(await orderRow()).toEqual({ status: "pending_approval", version: 1 });
    expect(await rows("select id from order_event where order_id = $1 and type = 'approved'")).toEqual([]);
  });

  test("an order without an email (manual order) is approved with its event and no outbox row", async () => {
    await database.client.query("update orders set contact_email = null where id = $1", [orderId]);

    expect(await approve(1)).toMatchObject({ ok: true });
    expect(await rows("select id from email_outbox where order_id = $1 and template = 'payment_instructions'")).toEqual([]);
    expect(await rows("select id from order_event where order_id = $1 and type = 'approved'")).toHaveLength(1);
  });
});

describe("one database round trip (ADR-0003 amendment 3)", () => {
  test("an approval and a refusal each cost exactly one statement", async () => {
    let queries = 0;
    const query = database.client.query.bind(database.client);
    database.client.query = (async (...args: Parameters<typeof query>) => (queries++, query(...args))) as typeof database.client.query;

    expect(await approve(1)).toMatchObject({ ok: true });
    expect(queries).toBe(1);
    expect(await approve(1)).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(queries).toBe(2);
  });
});
