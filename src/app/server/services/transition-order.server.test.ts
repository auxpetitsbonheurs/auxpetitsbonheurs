// Status actions on the server (S-115, S-116 AC2-AC6, S-117 AC1-AC7, S-119 AC2-AC6, S-124 AC2,
// AC3, AC5) against the in-process Postgres (PGlite) with real migrations.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { OrderStatus } from "~/domain/status";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { DELIVERY_ORDER, placeTestOrder } from "~/server/testing/orders";
import { type TransitionAction, transitionOrder } from "./transition-order.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;

const NOW = new Date("2026-11-12T10:05:00Z");

async function newOrder(overrides: Record<string, string> = {}): Promise<string> {
  const { token } = await placeTestOrder(database, { overrides });
  return (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  orderId = await newOrder();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const act = (action: TransitionAction, version: number, extra: { reason?: string; id?: string } = {}) =>
  transitionOrder(database.db, { orderId: extra.id ?? orderId, action, version, adminId, now: NOW, reason: extra.reason });

async function setStatus(status: OrderStatus, id = orderId) {
  await database.client.query("update orders set status = $2 where id = $1", [id, status]);
}

async function rows(query: string, id = orderId) {
  return (await database.client.query<Record<string, unknown>>(query, [id])).rows;
}

async function orderRow(id = orderId) {
  return (await rows("select status, version, paid, decline_reason from orders where id = $1", id))[0]!;
}

const outbox = (id = orderId) => rows("select template, dedupe_key, payload from email_outbox where order_id = $1 and template <> 'order_received' order by id", id);
const events = (id = orderId) =>
  rows("select actor_type, actor_admin_id, type, from_status, to_status, details from order_event where order_id = $1 and type <> 'created' order by id", id);

describe("advance (S-117 AC1-AC3, AC7)", () => {
  test("approved -> in_preparation with no email and one status_advanced event", async () => {
    await setStatus("approved");

    expect(await act("advance", 1)).toEqual({ ok: true, order: { status: "in_preparation", version: 2, paid: false } });
    expect(await outbox()).toEqual([]);
    expect(await events()).toEqual([
      { actor_type: "admin", actor_admin_id: adminId, type: "status_advanced", from_status: "approved", to_status: "in_preparation", details: null },
    ]);
  });

  test("a pickup order in preparation becomes ready_for_pickup and queues the Ready email", async () => {
    await setStatus("in_preparation");

    expect(await act("advance", 1)).toMatchObject({ ok: true, order: { status: "ready_for_pickup" } });
    expect(await outbox()).toEqual([{ template: "ready_for_pickup", dedupe_key: `order:${orderId}:ready_for_pickup:v2`, payload: { orderId } }]);
  });

  test("a delivery order in preparation goes out_for_delivery with the On the way email", async () => {
    const delivery = await newOrder({ ...DELIVERY_ORDER, displayedTotalRs: "1050" });
    await setStatus("in_preparation", delivery);

    expect(await act("advance", 1, { id: delivery })).toMatchObject({ ok: true, order: { status: "out_for_delivery" } });
    expect((await outbox(delivery)).map((r) => r.template)).toEqual(["on_the_way"]);
  });

  test("ready -> completed queues one Thank you, even after Back and Next again", async () => {
    await setStatus("ready_for_pickup");

    expect(await act("advance", 1)).toMatchObject({ ok: true, order: { status: "completed", version: 2 } });
    expect(await act("revert", 2)).toMatchObject({ ok: true, order: { status: "ready_for_pickup", version: 3 } });
    expect(await act("advance", 3)).toMatchObject({ ok: true, order: { status: "completed", version: 4 } });
    expect(await outbox()).toEqual([{ template: "thank_you", dedupe_key: `order:${orderId}:thank_you`, payload: { orderId } }]);
  });

  test("pending_approval cannot be advanced (S-115 AC2)", async () => {
    await setStatus("pending_approval");

    expect(await act("advance", 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await orderRow()).toMatchObject({ status: "pending_approval", version: 1 });
  });
});

describe("revert (S-117 AC4, AC5)", () => {
  test.each([
    ["in_preparation", "approved"],
    ["ready_for_pickup", "in_preparation"],
    ["completed", "ready_for_pickup"],
  ] as const)("%s goes back to %s with a status_reverted event and no email", async (from, to) => {
    await setStatus(from);

    expect(await act("revert", 1)).toMatchObject({ ok: true, order: { status: to } });
    expect(await outbox()).toEqual([]);
    expect(await events()).toMatchObject([{ type: "status_reverted", from_status: from, to_status: to }]);
  });

  test("approved cannot go back (owner Q12)", async () => {
    await setStatus("approved");

    expect(await act("revert", 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("decline a custom request (S-116 AC2-AC4)", () => {
  test("quote_needed: declined, reason stored, request_declined carries it", async () => {
    await setStatus("quote_needed");

    expect(await act("declineRequest", 1, { reason: "  Fully booked that week  " })).toMatchObject({ ok: true, order: { status: "declined" } });
    expect(await orderRow()).toMatchObject({ status: "declined", decline_reason: "Fully booked that week" });
    expect(await outbox()).toEqual([
      { template: "request_declined", dedupe_key: `order:${orderId}:request_declined:v2`, payload: { orderId, reason: "Fully booked that week" } },
    ]);
    expect(await events()).toMatchObject([{ type: "declined", details: { reason: "Fully booked that week" } }]);
  });

  test("without a reason the email omits it", async () => {
    await setStatus("quote_needed");

    await act("declineRequest", 1, { reason: "  " });
    expect(await outbox()).toMatchObject([{ payload: { orderId } }]);
  });

  test.each(["pending_approval", "quote_sent", "approved"] as const)("from %s it is INVALID_TRANSITION with no event or email", async (status) => {
    await setStatus(status);

    expect(await act("declineRequest", 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await events()).toEqual([]);
    expect(await outbox()).toEqual([]);
  });
});

describe("cancel (S-119 AC2-AC5)", () => {
  test("approved order: cancelled with reason in the event and Cancellation confirmed queued", async () => {
    await setStatus("approved");

    expect(await act("cancel", 1, { reason: "Customer asked by phone" })).toMatchObject({ ok: true, order: { status: "cancelled" } });
    expect(await events()).toMatchObject([{ type: "cancelled", actor_admin_id: adminId, details: { reason: "Customer asked by phone" } }]);
    expect((await outbox()).map((r) => r.template)).toEqual(["cancellation_confirmed"]);
  });

  test("a quote_sent order can be cancelled (quote withdrawn, owner Q6)", async () => {
    await setStatus("quote_sent");

    expect(await act("cancel", 1)).toMatchObject({ ok: true, order: { status: "cancelled" } });
  });

  test.each(["completed", "cancelled", "declined", "closed"] as const)("%s cannot be cancelled", async (status) => {
    await setStatus(status);

    expect(await act("cancel", 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("a paid order keeps its paid flag, owes its total back like a refusal, and the log notes it", async () => {
    await database.client.query("update orders set status = 'approved', paid = true, paid_at = now(), paid_by = $2 where id = $1", [orderId, adminId]);

    expect(await act("cancel", 1)).toEqual({ ok: true, order: { status: "cancelled", version: 2, paid: true } });
    expect(await events()).toMatchObject([{ type: "cancelled", details: { paid: true, refundDueRs: 850 } }]);
    expect((await rows("select refund_due_rs from orders where id = $1"))[0]).toEqual({ refund_due_rs: 850 });
  });

  test("an unpaid order owes nothing back", async () => {
    await setStatus("approved");

    await act("cancel", 1);
    expect((await rows("select refund_due_rs from orders where id = $1"))[0]).toEqual({ refund_due_rs: null });
  });

  test("awaiting a Juice payment it is refused instead, not cancelled", async () => {
    await setStatus("awaiting_payment");

    expect(await act("cancel", 1)).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("concurrency (S-117 AC6, S-124 AC2, AC3, AC5)", () => {
  test.each(["advance", "revert", "cancel", "approve"] as const)("%s with a stale version is ORDER_CHANGED with no partial change", async (action) => {
    await database.client.query("update orders set status = 'in_preparation', version = 5 where id = $1", [orderId]);

    expect(await act(action, 4)).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await orderRow()).toMatchObject({ status: "in_preparation", version: 5 });
    expect(await events()).toEqual([]);
    expect(await outbox()).toEqual([]);
  });

  test("a repeated identical advance never double-advances", async () => {
    await setStatus("approved");

    const results = await Promise.all([act("advance", 1), act("advance", 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: "ORDER_CHANGED" }]);
    expect(await orderRow()).toMatchObject({ status: "in_preparation", version: 2 });
    expect(await events()).toHaveLength(1);
  });

  test("an unknown order is NOT_FOUND", async () => {
    expect(await act("advance", 1, { id: "7d1f0c9e-1111-4222-8333-944455566677" })).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  test("when the outbox insert fails, status and event roll back together (S-116 AC6)", async () => {
    await setStatus("in_preparation");
    await database.client.exec(`
      create function fail_outbox() returns trigger language plpgsql as $$ begin raise exception 'boom'; end $$;
      create trigger fail_outbox before insert on email_outbox for each row execute function fail_outbox();`);

    await expect(act("advance", 1)).rejects.toThrow();
    expect(await orderRow()).toMatchObject({ status: "in_preparation", version: 1 });
    expect(await events()).toEqual([]);
  });
});
