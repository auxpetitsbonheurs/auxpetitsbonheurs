// E-08 quote state changes against PGlite (S-156, S-157, S-158, S-159, S-161): one versioned
// statement each, events and outbox rows in the same transaction, refusals explained.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { insertAdmin } from "~/server/testing/admins";
import { submitTestRequest } from "~/server/testing/custom-requests";
import { FakeAuth } from "~/server/testing/fake-auth";
import { paymentDeadlines } from "~/jobs/payment-deadlines";
import { acceptQuote, declineQuote, declineRequest, sendQuote } from "./quotes.server";

let database: TestDatabase;
let db: Database;
let adminId: string;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  adminId = (await insertAdmin(database, new FakeAuth(), { name: "Sabera", email: "owner@example.com" })).id;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const NOW = new Date("2026-11-10T08:00:00Z");
const query = async <T>(text: string, params: unknown[] = []) => (await database.client.query<T>(text, params)).rows;
const outbox = (orderId: string) => query<{ template: string; dedupe_key: string; to_email: string }>("select template, dedupe_key, to_email from email_outbox where order_id = $1 and template not like 'admin_alert_new_request' order by id", [orderId]);
const orderRow = (orderId: string) => query<{ status: string; version: number; total_rs: number }>("select status, version, total_rs from orders where id = $1", [orderId]).then((r) => r[0]!);

async function requestNeedingQuote() {
  const placed = await submitTestRequest(database);
  return { ...placed, version: 1 };
}

async function quoted(amountRs = 4500, expiresOn = "2026-11-15") {
  const request = await requestNeedingQuote();
  const result = await sendQuote(db, { orderId: request.orderId, version: 1, adminId, amountRs, note: "Two tiers, gold leaf", expiresOn, now: NOW });
  if (!result.ok) throw new Error(result.code);
  return { ...request, version: result.order.version };
}

const answer = (token: string, version: number, today = "2026-11-12") => ({ token, version, today, now: NOW });

describe("sendQuote (S-156)", () => {
  test("AC1: Rs 4,500 to 2026-11-15: Quote sent, total 4500, event names the admin, 'Your quote' queued", async () => {
    const request = await requestNeedingQuote();

    const result = await sendQuote(db, { orderId: request.orderId, version: 1, adminId, amountRs: 4500, note: "Two tiers", expiresOn: "2026-11-15", now: NOW });

    expect(result).toEqual({ ok: true, order: { status: "quote_sent", version: 2 } });
    expect(await orderRow(request.orderId)).toEqual({ status: "quote_sent", version: 2, total_rs: 4500 });
    expect(await query("select quote_amount_rs, quote_note, quote_expires_on::text, quote_sent_by from custom_request")).toEqual([
      { quote_amount_rs: 4500, quote_note: "Two tiers", quote_expires_on: "2026-11-15", quote_sent_by: adminId },
    ]);
    expect(await query("select actor_admin_id, type, from_status, to_status, details from order_event where type = 'quote_sent'")).toEqual([
      { actor_admin_id: adminId, type: "quote_sent", from_status: "quote_needed", to_status: "quote_sent", details: { amountRs: 4500, note: "Two tiers", expiresOn: "2026-11-15" } },
    ]);
    expect(await outbox(request.orderId)).toContainEqual({ template: "quote", dedupe_key: `order:${request.orderId}:quote:v2`, to_email: "aisha@example.com" });
  });

  test("AC5: Approved, Declined or Cancelled orders refuse with INVALID_TRANSITION and queue nothing", async () => {
    for (const status of ["approved", "declined", "cancelled"]) {
      const request = await requestNeedingQuote();
      await query("update orders set status = $1 where id = $2", [status, request.orderId]);
      expect(await sendQuote(db, { orderId: request.orderId, version: 1, adminId, amountRs: 100, note: null, expiresOn: "2026-11-15", now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
      expect((await outbox(request.orderId)).some((r) => r.template === "quote")).toBe(false);
    }
  });

  test("AC6: a stale version is ORDER_CHANGED and changes nothing", async () => {
    const request = await requestNeedingQuote();
    expect(await sendQuote(db, { orderId: request.orderId, version: 7, adminId, amountRs: 100, note: null, expiresOn: "2026-11-15", now: NOW })).toEqual({ ok: false, code: "ORDER_CHANGED" });
    expect(await orderRow(request.orderId)).toMatchObject({ status: "quote_needed", version: 1 });
  });

  test("a website order is never quoted", async () => {
    const request = await requestNeedingQuote();
    await query("update orders set source = 'website' where id = $1", [request.orderId]);
    expect(await sendQuote(db, { orderId: request.orderId, version: 1, adminId, amountRs: 100, note: null, expiresOn: "2026-11-15", now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("re-send a quote (S-161)", () => {
  test("AC1, AC3: the new quote replaces the old; the event keeps the previous values; a second email per version", async () => {
    const first = await quoted(4500, "2026-11-15");

    const result = await sendQuote(db, { orderId: first.orderId, version: first.version, adminId, amountRs: 5200, note: "Three tiers", expiresOn: "2026-11-18", now: NOW });

    expect(result).toEqual({ ok: true, order: { status: "quote_sent", version: 3 } });
    expect((await orderRow(first.orderId)).total_rs).toBe(5200);
    const [event] = await query<{ details: Record<string, unknown> }>("select details from order_event where type = 'quote_sent' order by id desc limit 1");
    expect(event!.details).toEqual({ amountRs: 5200, note: "Three tiers", expiresOn: "2026-11-18", previous: { amountRs: 4500, note: "Two tiers, gold leaf", expiresOn: "2026-11-15" } });
    expect((await outbox(first.orderId)).filter((r) => r.template === "quote").map((r) => r.dedupe_key).sort()).toEqual([`order:${first.orderId}:quote:v2`, `order:${first.orderId}:quote:v3`]);
  });

  test("AC5: the same values again are still a new quote and a new email", async () => {
    const first = await quoted(4500, "2026-11-15");
    await sendQuote(db, { orderId: first.orderId, version: first.version, adminId, amountRs: 4500, note: "Two tiers, gold leaf", expiresOn: "2026-11-15", now: NOW });
    expect((await outbox(first.orderId)).filter((r) => r.template === "quote")).toHaveLength(2);
  });

  test("AC4: after Approved, Closed or Declined a re-send is INVALID_TRANSITION", async () => {
    const accepted = await quoted();
    await acceptQuote(db, answer(accepted.trackingToken, accepted.version));
    expect(await sendQuote(db, { orderId: accepted.orderId, version: 3, adminId, amountRs: 1, note: null, expiresOn: "2026-11-20", now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });
});

describe("decline a request (S-157)", () => {
  test("AC1: with a reason: Declined, event, 'Request declined' with the reason", async () => {
    const request = await requestNeedingQuote();

    expect(await declineRequest(db, { orderId: request.orderId, version: 1, adminId, reason: "Fully booked that weekend", now: NOW })).toEqual({ ok: true, order: { status: "declined", version: 2 } });

    expect(await query("select status, decline_reason from orders")).toEqual([{ status: "declined", decline_reason: "Fully booked that weekend" }]);
    expect(await query("select type, actor_admin_id, details from order_event where type = 'declined'")).toEqual([{ type: "declined", actor_admin_id: adminId, details: { reason: "Fully booked that weekend" } }]);
    const [mail] = await query<{ payload: Record<string, unknown> }>("select payload from email_outbox where template = 'request_declined'");
    expect(mail!.payload).toEqual({ orderId: request.orderId, reason: "Fully booked that weekend" });
  });

  test("AC2: without a reason the email has no reason line", async () => {
    const request = await requestNeedingQuote();
    await declineRequest(db, { orderId: request.orderId, version: 1, adminId, reason: null, now: NOW });
    const [mail] = await query<{ payload: Record<string, unknown> }>("select payload from email_outbox where template = 'request_declined'");
    expect(mail!.payload).toEqual({ orderId: request.orderId });
  });

  test("AC4: not Quote needed is INVALID_TRANSITION; a stale version is ORDER_CHANGED", async () => {
    const sent = await quoted();
    expect(await declineRequest(db, { orderId: sent.orderId, version: sent.version, adminId, reason: null, now: NOW })).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    const request = await requestNeedingQuote();
    expect(await declineRequest(db, { orderId: request.orderId, version: 4, adminId, reason: null, now: NOW })).toEqual({ ok: false, code: "ORDER_CHANGED" });
  });
});

describe("accept a quote (S-158)", () => {
  test("AC1 (Juice payment hand-off): Awaiting payment from now, event quote_accepted, how-to-pay email queued, admins alerted", async () => {
    const sent = await quoted();

    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version))).toEqual({ ok: true, order: { status: "awaiting_payment", version: 3 } });

    expect(await query("select actor_type, type, from_status, to_status from order_event where type = 'quote_accepted'")).toEqual([{ actor_type: "customer", type: "quote_accepted", from_status: "quote_sent", to_status: "awaiting_payment" }]);
    expect(await query("select awaiting_payment_since = $1::timestamptz as since from orders", [NOW.toISOString()])).toEqual([{ since: true }]);
    const templates = (await query<{ template: string; to_email: string }>("select template, to_email from email_outbox where order_id = $1", [sent.orderId])).map((r) => `${r.template}:${r.to_email}`);
    expect(templates).toContain("quote_accepted:aisha@example.com");
    expect(templates).not.toContain("order_confirmed:aisha@example.com");
    expect(templates).toContain("admin_alert_quote_accepted:owner@example.com");
  });

  test("AC3: the day after expiry is QUOTE_EXPIRED, even with a stale version, and nothing changes", async () => {
    const sent = await quoted(4500, "2026-11-15");
    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version, "2026-11-16"))).toEqual({ ok: false, code: "QUOTE_EXPIRED" });
    expect(await acceptQuote(db, answer(sent.trackingToken, 1, "2026-11-16"))).toEqual({ ok: false, code: "QUOTE_EXPIRED" });
    expect((await orderRow(sent.orderId)).status).toBe("quote_sent");
  });

  test("AC4: on the expiry day it still succeeds", async () => {
    const sent = await quoted(4500, "2026-11-15");
    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version, "2026-11-15"))).toMatchObject({ ok: true });
  });

  test("AC5: a second accept is INVALID_TRANSITION with no second email; cancelled by the admin too", async () => {
    const sent = await quoted();
    await acceptQuote(db, answer(sent.trackingToken, sent.version));
    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version + 1))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
    expect((await outbox(sent.orderId)).filter((r) => r.template === "quote_accepted")).toHaveLength(1);

    const withdrawn = await quoted();
    await query("update orders set status = 'cancelled', version = version + 1 where id = $1", [withdrawn.orderId]);
    expect(await acceptQuote(db, answer(withdrawn.trackingToken, withdrawn.version))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("AC6: a date blocked since the quote still accepts (owner decision 10)", async () => {
    const sent = await quoted();
    await query("insert into blocked_date (starts_on, ends_on) values ('2026-11-12', '2026-11-12')");
    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version))).toMatchObject({ ok: true });
  });

  test("AC7 / S-161 AC2: after a re-quote the old page's version is ORDER_CHANGED", async () => {
    const sent = await quoted();
    await sendQuote(db, { orderId: sent.orderId, version: sent.version, adminId, amountRs: 5000, note: null, expiresOn: "2026-11-15", now: NOW });
    expect(await acceptQuote(db, answer(sent.trackingToken, sent.version))).toEqual({ ok: false, code: "ORDER_CHANGED" });
  });

  test("AC1: the 24 h payment deadline runs from the acceptance, not from the request days before; then Payment received confirms it", async () => {
    const sent = await quoted();
    const acceptedAt = new Date("2026-11-12T08:00:00Z");
    await acceptQuote(db, { ...answer(sent.trackingToken, sent.version), now: acceptedAt });
    const tick = (iso: string) => paymentDeadlines({ db, now: new Date(iso), supabase: { url: "https://ref.supabase.co", anonKey: "anon" } });

    await tick("2026-11-12T19:00:00Z");
    expect((await orderRow(sent.orderId)).status).toBe("awaiting_payment");
    await tick("2026-11-12T20:00:00Z");
    expect(await query("select type from order_event where type = 'payment_reminder_sent'")).toHaveLength(1);
    await tick("2026-11-13T08:00:00Z");
    expect((await orderRow(sent.orderId)).status).toBe("cancelled");
  });

  test("AC8: an unknown token is NOT_FOUND", async () => {
    expect(await acceptQuote(db, answer("x".repeat(43), 1))).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("decline a quote (S-159)", () => {
  test("AC1: Closed, 'Quote closed' queued, admins alerted", async () => {
    const sent = await quoted();
    expect(await declineQuote(db, answer(sent.trackingToken, sent.version))).toEqual({ ok: true, order: { status: "closed", version: 3 } });
    const templates = (await query<{ template: string }>("select template from email_outbox where order_id = $1", [sent.orderId])).map((r) => r.template);
    expect(templates).toContain("quote_closed");
    expect(templates).toContain("admin_alert_quote_declined");
    expect(await query("select type from order_event where type = 'quote_declined'")).toHaveLength(1);
  });

  test("AC3: already Closed is INVALID_TRANSITION; a stale version is ORDER_CHANGED", async () => {
    const sent = await quoted();
    expect(await declineQuote(db, answer(sent.trackingToken, 9))).toEqual({ ok: false, code: "ORDER_CHANGED" });
    await declineQuote(db, answer(sent.trackingToken, sent.version));
    expect(await declineQuote(db, answer(sent.trackingToken, sent.version + 1))).toEqual({ ok: false, code: "INVALID_TRANSITION" });
  });

  test("AC4: after the expiry day, before the job, declining still closes it", async () => {
    const sent = await quoted(4500, "2026-11-15");
    expect(await declineQuote(db, answer(sent.trackingToken, sent.version, "2026-11-17"))).toMatchObject({ ok: true });
  });
});
