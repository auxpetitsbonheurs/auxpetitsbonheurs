// S-195: admin alert emails go through the one outbox sender (S-186) with the shared layout.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { placeTestOrder } from "~/server/testing/orders";
import { alertAdmin } from "~/server/testing/push";
import { capDecision } from "./daily-cap";
import { processOutbox } from "./process-outbox.server";
import { EmailSendError, type EmailMessage, type Mailer } from "./sender.server";
import { ADMIN_ALERT_KEYS, renderAdminAlertEmail } from "./templates/admin-alert-emails";

let database: TestDatabase;
let db: Database;
const NOW = new Date("2026-11-13T06:00:00Z");
const SITE = "https://shop.test";

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
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

async function orderWithAlerts() {
  const en = await alertAdmin(database, { locale: "en", devices: 0 });
  const fr = await alertAdmin(database, { locale: "fr", devices: 0 });
  await placeTestOrder(database, { overrides: { "contact.name": "Aisha Ramdin", address: "12 Royal Road" } });
  await database.client.query("update email_outbox set next_attempt_at = $1", [new Date(NOW.getTime() - 60_000).toISOString()]);
  const { rows } = await database.client.query<{ id: string }>("select id from orders");
  return { en, fr, orderId: rows[0]!.id };
}

const run = (mailer: Mailer) => processOutbox(db, { now: NOW, mailer, siteUrl: SITE, limit: 50 });

describe("admin_alert_new_order through the outbox (AC1, AC8)", () => {
  test("each admin gets one email in their language with the number, first name and a link to the order only", async () => {
    const { en, fr, orderId } = await orderWithAlerts();
    const mailer = new FakeMailer();

    await run(mailer);

    const toEn = mailer.sent.find((m) => m.to === en.email)!;
    const toFr = mailer.sent.find((m) => m.to === fr.email)!;
    expect(toEn.subject).toMatch(/^New order APB-\d{4}$/);
    expect(toEn.text).toContain("from Aisha");
    expect(toEn.html).toContain(`href="https://shop.test/admin/orders/${orderId}"`);
    expect(toFr.subject).toMatch(/^Nouvelle commande APB-/);
    expect(toFr.html).toContain('lang="fr"');
    for (const message of [toEn, toFr]) expect(`${message.html}${message.text}`).not.toMatch(/Ramdin|Royal Road|5712|\+230|Rs /);
  });
});

describe("a failing admin alert (AC6)", () => {
  test("stays pending for retry and never writes email_failed into the order's log", async () => {
    await orderWithAlerts();
    const mailer = new FakeMailer();
    mailer.next = new EmailSendError("provider");

    await run(mailer);

    const { rows } = await database.client.query<{ status: string }>("select status from email_outbox where template = 'admin_alert_new_order'");
    expect(rows.map((r) => r.status)).toEqual(["pending", "pending"]);
    await database.client.query("update email_outbox set status = 'pending', attempts = 5, next_attempt_at = $1 where template = 'admin_alert_new_order'", [NOW.toISOString()]);
    await run(mailer);
    expect((await database.client.query("select 1 from order_event where type = 'email_failed'")).rows).toHaveLength(0);
  });
});

describe("daily cap (AC10)", () => {
  test("from 90 sent today every admin alert waits (non-critical) while an order email still goes", () => {
    for (const key of ADMIN_ALERT_KEYS) expect(capDecision(key, 90)).toBe("defer");
    expect(capDecision("order_confirmed", 90)).toBe("send");
  });
});

describe("rendering", () => {
  test.each(ADMIN_ALERT_KEYS)("%s exists in English and French, with and without a name", (key) => {
    for (const contactName of ["Aisha Ramdin", null]) {
      const en = renderAdminAlertEmail(key, { siteUrl: SITE, locale: "en", orderId: "o1", orderNumber: "APB-0042", contactName });
      const fr = renderAdminAlertEmail(key, { siteUrl: SITE, locale: "fr", orderId: "o1", orderNumber: "APB-0042", contactName });
      expect(en.subject).toContain("APB-0042");
      expect(fr.subject).not.toBe(en.subject);
      expect(`${en.text}${fr.text}`).not.toMatch(/\{\{|admin\.push|email\.adminAlert/);
    }
  });
});
