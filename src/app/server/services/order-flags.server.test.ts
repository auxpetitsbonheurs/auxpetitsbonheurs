// Paid flag (S-119 AC1, AC6; S-115 AC6) and the private note (S-114 AC1, AC2; S-124 AC5)
// against PGlite with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { saveAdminNote, setPaid } from "./order-flags.server";
import { transitionOrder } from "./transition-order.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;

const NOW = new Date("2026-11-12T10:05:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
  // Website orders start awaiting their Juice payment; these tests use the approval path.
  await database.client.query("update orders set status = 'pending_approval' where id = $1", [orderId]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

const pay = (paid: boolean, version: number) => setPaid(database.db, { orderId, paid, version, adminId, now: NOW });

async function order() {
  return (
    await database.client.query<Record<string, unknown>>("select status, version, paid, paid_at, paid_by, admin_note from orders where id = $1", [orderId])
  ).rows[0]!;
}

const eventTypes = async () =>
  (await database.client.query<{ type: string }>("select type from order_event where order_id = $1 and type <> 'created' order by id", [orderId])).rows.map((r) => r.type);
const outboxCount = async () => (await database.client.query("select id from email_outbox where order_id = $1 and template not in ('order_received', 'admin_alert_new_order')", [orderId])).rows.length;

describe("setPaid (S-119 AC1)", () => {
  test("Mark paid sets paid, paid_at and paid_by, logs marked_paid, keeps the status, sends nothing", async () => {
    expect(await pay(true, 1)).toEqual({ ok: true, order: { status: "pending_approval", version: 2, paid: true } });
    expect(await order()).toMatchObject({ status: "pending_approval", paid: true, paid_by: adminId, paid_at: NOW });
    expect(await eventTypes()).toEqual(["marked_paid"]);
    expect(await outboxCount()).toBe(0);
  });

  test("Mark unpaid reverses it with marked_unpaid", async () => {
    await pay(true, 1);

    expect(await pay(false, 2)).toMatchObject({ ok: true, order: { paid: false, version: 3 } });
    expect(await order()).toMatchObject({ paid: false, paid_at: null, paid_by: null });
    expect(await eventTypes()).toEqual(["marked_paid", "marked_unpaid"]);
  });

  test("works at any status, including completed and cancelled (S-115 AC6)", async () => {
    await database.client.query("update orders set status = 'cancelled' where id = $1", [orderId]);

    expect(await pay(true, 1)).toMatchObject({ ok: true, order: { status: "cancelled", paid: true } });
  });

  test("asking for the flag it already has changes nothing and is not an error", async () => {
    expect(await pay(false, 1)).toEqual({ ok: true, order: { status: "pending_approval", version: 1, paid: false } });
    expect(await eventTypes()).toEqual([]);
  });

  test("awaiting a Juice payment it is INVALID_TRANSITION: Payment received is the way (juice-payment spec)", async () => {
    await database.client.query("update orders set status = 'awaiting_payment' where id = $1", [orderId]);

    expect(await pay(true, 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await order()).toMatchObject({ paid: false, version: 1 });
  });

  test("a stale version is ORDER_CHANGED (S-119 AC6)", async () => {
    await transitionOrder(database.db, { orderId, action: "approve", version: 1, adminId, now: NOW });

    expect(await pay(true, 1)).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await order()).toMatchObject({ paid: false, version: 2 });
  });
});

describe("saveAdminNote (S-114 AC1, AC2)", () => {
  test("stores the note without a version bump or an event", async () => {
    expect(await saveAdminNote(database.db, orderId, "Allergic to nuts, call first")).toBe(true);

    expect(await order()).toMatchObject({ admin_note: "Allergic to nuts, call first", version: 1 });
    expect(await eventTypes()).toEqual([]);
  });

  test("a status change in between never makes the note conflict (last write wins)", async () => {
    await transitionOrder(database.db, { orderId, action: "approve", version: 1, adminId, now: NOW });

    expect(await saveAdminNote(database.db, orderId, "Still fine")).toBe(true);
    expect(await order()).toMatchObject({ status: "approved", admin_note: "Still fine", version: 2 });
  });

  test("a blank note is stored as null; an unknown order is false", async () => {
    await saveAdminNote(database.db, orderId, "x");
    await saveAdminNote(database.db, orderId, "   ");

    expect(await order()).toMatchObject({ admin_note: null });
    expect(await saveAdminNote(database.db, "7d1f0c9e-1111-4222-8333-944455566677", "x")).toBe(false);
  });
});
