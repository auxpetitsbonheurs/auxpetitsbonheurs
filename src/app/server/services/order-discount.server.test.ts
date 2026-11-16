// S-320 order discount, against PGlite with the real migrations: one versioned statement writes
// the discount, the total to pay, the activity event and (awaiting payment) a fresh
// payment_instructions email; it never races with Approve or Payment received.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { removeOrderDiscount, setOrderDiscount } from "./order-discount.server";
import { markPaid, undoPaid } from "./order-payment.server";
import { approveOrder } from "./approve-order.server";

let database: TestDatabase;
let adminId: string;
let orderId: string;

const NOW = new Date("2026-11-16T10:05:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sarah" })).id;
  // Rs 850 of goods, pickup, pending approval, version 1.
  const { token } = await placeTestOrder(database);
  orderId = (await database.client.query<{ id: string }>("select id from orders where tracking_token = $1", [token])).rows[0]!.id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const base = (version: number) => ({ orderId, version, adminId, now: NOW });
const amount = (version: number, value: number, reason: string | null = null) => ({ ...base(version), kind: "amount" as const, value, reason });
const percent = (version: number, value: number, reason: string | null = null) => ({ ...base(version), kind: "percent" as const, value, reason });

async function orderRow() {
  return (
    await database.client.query<Record<string, unknown>>(
      "select status, version, total_rs, discount_rs, discount_percent, discount_reason, delivery_fee_rs from orders where id = $1",
      [orderId],
    )
  ).rows[0]!;
}

async function rows(sql: string) {
  return (await database.client.query<Record<string, unknown>>(sql, [orderId])).rows;
}

const events = () => rows("select actor_admin_id, type, details from order_event where order_id = $1 and type like 'discount_%' order by id");
const paymentEmails = () => rows("select status, last_error, dedupe_key, payload from email_outbox where order_id = $1 and template = 'payment_instructions' order by dedupe_key");

describe("setDiscount (S-320 AC1-AC3)", () => {
  test("a fixed amount comes off the total, with the reason, a new version and a discount_added event", async () => {
    const result = await setOrderDiscount(database.db, amount(1, 150, "Loyal customer"));

    expect(result).toEqual({ ok: true, order: { status: "pending_approval", version: 2 } });
    expect(await orderRow()).toMatchObject({ version: 2, total_rs: 700, discount_rs: 150, discount_percent: null, discount_reason: "Loyal customer" });
    expect(await events()).toEqual([
      { actor_admin_id: adminId, type: "discount_added", details: { toRs: 150, reason: "Loyal customer", totalRs: 700 } },
    ]);
  });

  test("a percentage of the goods is rounded half up and stored with the percent typed", async () => {
    await setOrderDiscount(database.db, percent(1, 15));

    // 15% of 850 = 127.5 → Rs 128.
    expect(await orderRow()).toMatchObject({ total_rs: 722, discount_rs: 128, discount_percent: 15, discount_reason: null });
  });

  test("changing it starts from the full price, not from the discounted total, and logs discount_changed", async () => {
    await setOrderDiscount(database.db, amount(1, 150));
    await setOrderDiscount(database.db, percent(2, 10, "Promo"));

    expect(await orderRow()).toMatchObject({ version: 3, total_rs: 765, discount_rs: 85, discount_percent: 10, discount_reason: "Promo" });
    expect((await events()).map((e) => [e.type, e.details])).toEqual([
      ["discount_added", { toRs: 150, totalRs: 700 }],
      ["discount_changed", { fromRs: 150, toRs: 85, percent: 10, reason: "Promo", totalRs: 765 }],
    ]);
  });

  test("the delivery fee is never discounted: at most the goods, so the total never drops below the fee", async () => {
    await database.client.query("update orders set fulfilment = 'delivery', address = 'Somewhere', delivery_fee_rs = 150, total_rs = 1000 where id = $1", [orderId]);

    expect(await setOrderDiscount(database.db, amount(1, 851))).toEqual({ ok: false, code: "VALIDATION_FAILED", field: "value", kind: "amount", maxRs: 850 });
    expect(await setOrderDiscount(database.db, percent(1, 100))).toMatchObject({ ok: true });
    expect(await orderRow()).toMatchObject({ total_rs: 150, discount_rs: 850 });
  });

  test("out of range is VALIDATION_FAILED with the goods as the maximum, and nothing changes", async () => {
    expect(await setOrderDiscount(database.db, amount(1, 0))).toMatchObject({ ok: false, code: "VALIDATION_FAILED", maxRs: 850 });
    expect(await setOrderDiscount(database.db, percent(1, 101))).toMatchObject({ ok: false, code: "VALIDATION_FAILED", kind: "percent" });
    expect(await orderRow()).toMatchObject({ version: 1, total_rs: 850, discount_rs: null });
    expect(await events()).toEqual([]);
  });

  test("a stale version is ORDER_CHANGED; an unknown order NOT_FOUND", async () => {
    await setOrderDiscount(database.db, amount(1, 100));

    expect(await setOrderDiscount(database.db, amount(1, 200))).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await setOrderDiscount(database.db, { ...amount(1, 1), orderId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await orderRow()).toMatchObject({ discount_rs: 100 });
  });
});

describe("removeDiscount (S-320 AC3)", () => {
  test("the total goes back to the full price and discount_removed is logged", async () => {
    await setOrderDiscount(database.db, percent(1, 20, "Promo"));
    const result = await removeOrderDiscount(database.db, base(2));

    expect(result).toEqual({ ok: true, order: { status: "pending_approval", version: 3 } });
    expect(await orderRow()).toMatchObject({ total_rs: 850, discount_rs: null, discount_percent: null, discount_reason: null });
    expect((await events()).at(-1)).toMatchObject({ type: "discount_removed", details: { fromRs: 170, totalRs: 850 } });
  });

  test("nothing to remove is INVALID_TRANSITION", async () => {
    expect(await removeOrderDiscount(database.db, base(1))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("when it can change (S-320 AC4, AC5)", () => {
  test("Payment received locks it; its Undo unlocks it", async () => {
    await approveOrder(database.db, base(1));
    await setOrderDiscount(database.db, amount(2, 50));
    await markPaid(database.db, base(3));

    expect(await setOrderDiscount(database.db, amount(4, 60))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect(await removeOrderDiscount(database.db, base(4))).toEqual({ ok: false, code: "INVALID_TRANSITION" });

    await undoPaid(database.db, base(4));
    expect(await setOrderDiscount(database.db, amount(5, 60))).toMatchObject({ ok: true });
    expect(await orderRow()).toMatchObject({ status: "awaiting_payment", total_rs: 790, discount_rs: 60 });
  });

  test("Payment received records the discounted amount", async () => {
    await approveOrder(database.db, base(1));
    await setOrderDiscount(database.db, amount(2, 50));
    await markPaid(database.db, base(3));

    expect(await rows("select details from order_event where order_id = $1 and type = 'payment_received'")).toEqual([{ details: { amountRs: 800 } }]);
  });

  test("a discount added on a stale page never overwrites an approval that happened meanwhile", async () => {
    await approveOrder(database.db, base(1));

    expect(await setOrderDiscount(database.db, amount(1, 50))).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await orderRow()).toMatchObject({ status: "awaiting_payment", total_rs: 850, discount_rs: null });
  });

  test("cancelled and declined orders take none", async () => {
    for (const status of ["cancelled", "declined"]) {
      await database.client.query("update orders set status = $2 where id = $1", [orderId, status]);
      expect(await setOrderDiscount(database.db, amount(1, 50))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    }
  });
});

describe("the customer is told the new amount (S-320 AC6)", () => {
  test("while awaiting payment, a change withdraws the pending payment email and queues a fresh one", async () => {
    await approveOrder(database.db, base(1));
    await setOrderDiscount(database.db, amount(2, 50));

    expect(await paymentEmails()).toEqual([
      { status: "dead", last_error: "withdrawn", dedupe_key: `order:${orderId}:payment_instructions:v2`, payload: { orderId } },
      { status: "pending", last_error: null, dedupe_key: `order:${orderId}:payment_instructions:v3`, payload: { orderId, amountChanged: true } },
    ]);
  });

  test("an email already sent stays sent; the new one follows", async () => {
    await approveOrder(database.db, base(1));
    await database.client.query("update email_outbox set status = 'sent', sent_at = now() where order_id = $1", [orderId]);
    await removeOrderDiscount(database.db, base(2)).catch(() => null);
    await setOrderDiscount(database.db, amount(2, 50));

    expect((await paymentEmails()).map((e) => e.status)).toEqual(["sent", "pending"]);
  });

  test("while pending approval no email is queued (the approval's email will carry the amount)", async () => {
    await setOrderDiscount(database.db, amount(1, 50));

    expect(await paymentEmails()).toEqual([]);
  });
});
