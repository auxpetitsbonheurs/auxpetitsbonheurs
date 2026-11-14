// S-199: admins are told when a quote expires (push only, after the close succeeded).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { acceptQuote, sendQuote } from "~/server/services/quotes.server";
import { submitTestRequest } from "~/server/testing/custom-requests";
import { RecordingPusher, alertAdmin } from "~/server/testing/push";
import { expireQuotes } from "./expire-quotes";

let database: TestDatabase;
let db: Database;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const AFTER_EXPIRY = "2026-11-17T08:00:00Z";

async function quoteUntil(expiresOn: string, adminId: string) {
  const placed = await submitTestRequest(database, { "contact.name": "Aisha Ramdin" });
  const sent = await sendQuote(db, { orderId: placed.orderId, version: 1, adminId, amountRs: 4500, note: null, expiresOn, now: new Date("2026-11-10T08:00:00Z") });
  if (!sent.ok) throw new Error(sent.code);
  return { ...placed, version: sent.order.version };
}

const run = (pusher: RecordingPusher, now = AFTER_EXPIRY) => expireQuotes({ now: new Date(now), db, supabase: { url: "https://ref.supabase.co", anonKey: "anon" }, pusher });

describe("expireQuotes push (S-199)", () => {
  test("AC1, AC5: each admin with push on gets one push opening the order, number and first name only, in their language; the customer gets quote_closed", async () => {
    const en = await alertAdmin(database, { locale: "en" });
    const fr = await alertAdmin(database, { locale: "fr" });
    const quote = await quoteUntil("2026-11-15", en.id);
    const pusher = new RecordingPusher();

    await run(pusher);

    const byAdmin = new Map(pusher.sent.map((s) => [s.device.endpoint.split("/")[3], s.payload]));
    expect(byAdmin.get(en.id)).toMatchObject({ title: expect.stringMatching(/^Quote expired /), body: "No answer from Aisha. You may want to follow up.", url: `/admin/orders/${quote.orderId}`, tag: `quote_expired:${quote.orderId}` });
    expect(byAdmin.get(fr.id)?.title).toMatch(/^Devis expiré /);
    const { rows } = await database.client.query("select 1 from email_outbox where template = 'quote_closed'");
    expect(rows).toHaveLength(1);
  });

  test("AC2: a quote the customer accepted first is not closed, so no push", async () => {
    const admin = await alertAdmin(database);
    const quote = await quoteUntil("2026-11-15", admin.id);
    const accepted = await acceptQuote(db, { token: quote.trackingToken, version: quote.version, today: "2026-11-14", now: new Date("2026-11-14T08:00:00Z") });
    expect(accepted.ok).toBe(true);
    const pusher = new RecordingPusher();

    await run(pusher);

    expect(pusher.sent).toHaveLength(0);
  });

  test("AC3: push off or deactivated: nothing; and no admin email for this alert", async () => {
    const admin = await alertAdmin(database, { push: false });
    await alertAdmin(database, { active: false });
    await quoteUntil("2026-11-15", admin.id);
    const pusher = new RecordingPusher();

    await run(pusher);

    expect(pusher.sent).toHaveLength(0);
    const { rows } = await database.client.query("select 1 from email_outbox where template like 'admin_alert%' and template <> 'admin_alert_new_request'");
    expect(rows).toHaveLength(0);
  });

  test("AC4: the job runs twice: one push per admin for that quote", async () => {
    const admin = await alertAdmin(database);
    await quoteUntil("2026-11-15", admin.id);
    const pusher = new RecordingPusher();

    await run(pusher);
    await run(pusher, "2026-11-17T09:00:00Z");

    expect(pusher.sent).toHaveLength(1);
  });
});
