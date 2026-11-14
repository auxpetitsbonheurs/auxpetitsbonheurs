// S-186 and S-187: the outbox sender against PGlite with the real migrations and a fake mailer
// at the HTTP boundary (no network): retries, backoff, dead rows, the daily cap, no key.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { retryEmails } from "~/jobs/retry-emails";
import type { JobContext } from "~/jobs/types";
import { RECIPIENT_DAILY_CAP } from "./daily-cap";
import { processOutbox } from "./process-outbox.server";
import { EmailSendError, type EmailMessage, type Mailer, resendMailer } from "./sender.server";

let database: TestDatabase;
let db: Database;
const NOW = new Date("2026-11-13T06:00:00Z");
const SITE = "https://shop.test";
const HOUR = 3_600_000;

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  await placeTestOrder(database);
  // The row was queued a minute before the tick, whatever the machine's real clock says.
  await database.client.query("update email_outbox set next_attempt_at = $1, created_at = $1", [new Date(NOW.getTime() - 60_000).toISOString()]);
}, 60_000);

afterEach(async () => {
  await database.close();
});

class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  next: Error | null = null;
  async send(message: EmailMessage) {
    if (this.next) throw this.next;
    this.sent.push(message);
    return { id: `re-${this.sent.length}` };
  }
}

const run = (mailer: Mailer | null, now = NOW, extra: { timeoutMs?: number; limit?: number } = {}) =>
  processOutbox(db, { now, mailer, siteUrl: mailer ? SITE : null, limit: extra.limit ?? 50, ...(extra.timeoutMs ? { timeoutMs: extra.timeoutMs } : {}) });

async function outbox() {
  return (await database.client.query<{ id: string; template: string; status: string; attempts: number; last_error: string | null; provider_id: string | null; next_attempt_at: Date }>("select id, template, status, attempts, last_error, provider_id, next_attempt_at from email_outbox order by created_at, id")).rows[0]!;
}

describe("delivery (S-186 AC3)", () => {
  test("a due row is sent once, with its provider id, and not again", async () => {
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 1, failed: 0, dead: 0 });
    expect(await run(mailer)).toMatchObject({ sent: 0 });

    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]!.subject).toMatch(/We received your order APB-/);
    expect(mailer.sent[0]!.idempotencyKey).toMatch(/^outbox-/);
    expect(await outbox()).toMatchObject({ status: "sent", provider_id: "re-1", attempts: 1, last_error: null });
  });

  test("a French order gets the French email (S-193)", async () => {
    await database.client.query("update orders set locale = 'fr'");
    await database.client.query("update email_outbox set locale = 'fr'");
    const mailer = new FakeMailer();

    await run(mailer);

    expect(mailer.sent[0]!.subject).toMatch(/Nous avons reçu votre commande/);
    expect(mailer.sent[0]!.html).toContain('lang="fr"');
  });

  test("at most `limit` rows per run", async () => {
    await database.client.query(
      "insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key, next_attempt_at) select template, to_email, locale, payload, order_id, dedupe_key || g, next_attempt_at from email_outbox, generate_series(1, 2) g",
    );
    const mailer = new FakeMailer();

    const report = await run(mailer, NOW, { limit: 2 });

    expect(report.sent).toBe(2);
    expect(mailer.sent).toHaveLength(2);
  });

  test("no due rows: nothing sent, no error (AC9)", async () => {
    await database.client.query("update email_outbox set next_attempt_at = $1", [new Date(NOW.getTime() + HOUR).toISOString()]);

    expect(await run(new FakeMailer())).toEqual({ sent: 0, failed: 0, dead: 0, deferred: 0, capped: 0, notConfigured: false });
  });
});

describe("failure and backoff (S-186 AC2, AC4, AC7)", () => {
  test("a provider failure leaves the row pending, one hour later, with the kind only", async () => {
    const mailer = new FakeMailer();
    mailer.next = new EmailSendError("provider");

    expect(await run(mailer)).toMatchObject({ failed: 1 });

    const row = await outbox();
    expect(row).toMatchObject({ status: "pending", attempts: 1, last_error: "provider" });
    expect(row.next_attempt_at.getTime()).toBe(NOW.getTime() + HOUR);
  });

  test("the delays are 1, 2, 4, 8 and 24 hours; the sixth failure is dead with an email_failed event", async () => {
    const mailer = new FakeMailer();
    mailer.next = new EmailSendError("network");
    let now = NOW;
    const gaps: number[] = [];

    for (let attempt = 1; attempt <= 5; attempt++) {
      await run(mailer, now);
      const row = await outbox();
      gaps.push((row.next_attempt_at.getTime() - now.getTime()) / HOUR);
      now = row.next_attempt_at;
    }
    expect(gaps).toEqual([1, 2, 4, 8, 24]);

    expect(await run(mailer, now)).toMatchObject({ dead: 1 });
    expect(await outbox()).toMatchObject({ status: "dead", attempts: 6 });
    const events = await database.client.query("select details from order_event where type = 'email_failed'");
    expect(events.rows).toEqual([{ details: { template: "order_received", reason: "network" } }]);
  });

  test("a permanent refusal (an invalid address) is dead at once", async () => {
    const fetch = (async () => Response.json({ message: "invalid to" }, { status: 422 })) as unknown as typeof globalThis.fetch;

    expect(await run(resendMailer({ apiKey: "re_placeholder", from: "a@example.com", fetch }))).toMatchObject({ dead: 1 });

    expect(await outbox()).toMatchObject({ status: "dead", attempts: 1, last_error: "provider_permanent" });
  });

  test("429 and 500 are transient", async () => {
    for (const status of [429, 500]) {
      await database.client.query("update email_outbox set status = 'pending', attempts = 0, next_attempt_at = $1", [NOW.toISOString()]);
      const fetch = (async () => Response.json({}, { status })) as unknown as typeof globalThis.fetch;

      expect(await run(resendMailer({ apiKey: "re_placeholder", from: "a@example.com", fetch }))).toMatchObject({ failed: 1, dead: 0 });
    }
  });

  test("no answer within the deadline is a timeout and the row stays pending", async () => {
    const hang: Mailer = { send: () => new Promise(() => {}) };

    await run(hang, NOW, { timeoutMs: 20 });

    expect(await outbox()).toMatchObject({ status: "pending", attempts: 1, last_error: "timeout" });
  });

  test("a row whose order vanished is dead, not retried forever", async () => {
    await database.client.query("update email_outbox set order_id = null, payload = '{}'");

    expect(await run(new FakeMailer())).toMatchObject({ dead: 1 });
  });
});

describe("email not set up (S-186 AC8)", () => {
  test("nothing is sent, the row stays queued untouched, and the line says so", async () => {
    const lines: string[] = [];
    const original = console.log;
    console.log = (line: string) => void lines.push(String(line));
    try {
      expect(await run(null)).toMatchObject({ notConfigured: true, sent: 0 });
    } finally {
      console.log = original;
    }

    expect(await outbox()).toMatchObject({ status: "pending", attempts: 0 });
    expect(lines.join("")).toContain("email not set up");
  });

  test("restoring the key sends the waiting row", async () => {
    await run(null);
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 1 });
  });

  test("the cron job reads RESEND_API_KEY, EMAIL_FROM and SITE_URL from env and never throws without them", async () => {
    const result = await retryEmails({ now: NOW, db, env: {} } as unknown as JobContext);

    expect(result).toEqual({ job: "retryEmails", ran: true, processed: 0 });
    expect(await outbox()).toMatchObject({ status: "pending" });
  });
});

describe("the daily cap (S-187)", () => {
  async function sentRows(count: number) {
    await database.client.query(
      "insert into email_outbox (template, to_email, locale, payload, dedupe_key, status, sent_at) select 'order_received', 'a@example.com', 'en', '{}', 'sent-' || g, 'sent', $1 from generate_series(1, $2::int) g",
      [NOW.toISOString(), count],
    );
  }

  test("from 90, a thank-you waits for tomorrow and an order email still goes", async () => {
    await sentRows(90);
    await database.client.query("update email_outbox set template = 'thank_you' where dedupe_key not like 'sent-%'");
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 0, deferred: 1 });
    const row = await outbox();
    expect(row.status).toBe("pending");
    expect(row.next_attempt_at.toISOString()).toBe("2026-11-13T20:00:00.000Z");

    await database.client.query("update email_outbox set template = 'order_received', next_attempt_at = $1 where status = 'pending'", [NOW.toISOString()]);
    expect(await run(mailer)).toMatchObject({ sent: 1 });
  });

  test("at 100 nothing sends, nothing dies, and the row goes out after midnight", async () => {
    await sentRows(100);
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 0, dead: 0 });
    expect(await outbox()).toMatchObject({ status: "pending", attempts: 0 });

    const tomorrow = new Date("2026-11-14T00:30:00Z");
    expect(await run(mailer, tomorrow)).toMatchObject({ sent: 1 });
  });

  test("the day is the Mauritius day: 20:30Z is already tomorrow", async () => {
    await sentRows(100);
    const mailer = new FakeMailer();

    expect(await run(mailer, new Date("2026-11-13T20:30:00Z"))).toMatchObject({ sent: 1 });
  });
});

describe("per-recipient cap on publicly triggered emails (SEC-07, threat model G-08)", () => {
  const VICTIM = "Victim@Example.com";

  /** `count` order or request emails already sent to the victim, `hoursAgo` before NOW. */
  async function sentToVictim(count: number, hoursAgo: number, template = "order_received") {
    await database.client.query(
      "insert into email_outbox (template, to_email, locale, payload, dedupe_key, status, sent_at) select $4, 'victim@example.com', 'en', '{}', 'v-' || $3 || '-' || g, 'sent', $1 from generate_series(1, $2::int) g",
      [new Date(NOW.getTime() - hoursAgo * HOUR).toISOString(), count, `${hoursAgo}-${template}`, template],
    );
  }
  const pointQueuedRowAtVictim = (template = "order_received") =>
    database.client.query("update email_outbox set to_email = $1, template = $2 where status = 'pending'", [VICTIM, template]);

  test(`after ${RECIPIENT_DAILY_CAP} order or request emails to one address in 24 h, the next is not sent: dead, logged on the order, never retried`, async () => {
    await sentToVictim(2, 3, "order_received");
    await sentToVictim(1, 1, "request_received");
    await pointQueuedRowAtVictim();
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 0, dead: 0, capped: 1 });

    expect(mailer.sent).toEqual([]);
    expect(await outbox()).toMatchObject({ status: "dead", last_error: "recipient_cap" });
    const { rows } = await database.client.query("select type, details from order_event where type = 'email_failed'");
    expect(rows).toEqual([{ type: "email_failed", details: { template: "order_received", reason: "recipient_cap" } }]);
    expect(await run(mailer, new Date(NOW.getTime() + 2 * HOUR))).toMatchObject({ sent: 0, capped: 0 });
  });

  test("emails older than 24 h, and other kinds of email (quotes, confirmations), do not count", async () => {
    await sentToVictim(5, 25);
    await sentToVictim(5, 1, "order_confirmed");
    await pointQueuedRowAtVictim();
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 1, capped: 0 });
  });

  test("only publicly triggered emails are capped: an order update to the same address still goes", async () => {
    await sentToVictim(RECIPIENT_DAILY_CAP, 1);
    await pointQueuedRowAtVictim("order_confirmed");
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: 1, capped: 0 });
  });

  test("many queued at once (one script, many IPs) still send at most the cap in one run", async () => {
    await database.client.query(
      "insert into email_outbox (template, to_email, locale, payload, order_id, dedupe_key, next_attempt_at) select template, to_email, locale, payload, order_id, dedupe_key || g, next_attempt_at from email_outbox, generate_series(1, 5) g",
    );
    await pointQueuedRowAtVictim();
    const mailer = new FakeMailer();

    expect(await run(mailer)).toMatchObject({ sent: RECIPIENT_DAILY_CAP, capped: 6 - RECIPIENT_DAILY_CAP });
    expect(mailer.sent.every((message) => message.to === VICTIM)).toBe(true);
  });
});

