// S-195: admins alerted by push and email on new orders, requests and customer answers.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { PushConfig, PushDevice, PushPayload, Pusher } from "~/server/push/push.server";
import { saveSubscription } from "~/server/push/subscriptions.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { pushOrderAlert, queueNewOrderEmails } from "./admin-alerts.server";
import { ORDER_ALERTS } from "./push-text.server";

let database: TestDatabase;
const auth = new FakeAuth();
const now = new Date("2026-11-05T08:00:00Z");

class RecordingPusher implements Pusher {
  sent: { device: PushDevice; payload: PushPayload }[] = [];
  async send(device: PushDevice, payload: PushPayload) {
    this.sent.push({ device, payload });
    return { outcome: "sent" as const, status: 201 };
  }
}

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const KEYS = { p256dh: "k", auth: "a" };

async function admin(options: { locale?: "en" | "fr"; push?: boolean; email?: boolean; active?: boolean; devices?: number } = {}) {
  const row = await insertAdmin(database, auth, { locale: options.locale, active: options.active });
  await database.client.query("update admin set alert_push = $2, alert_email = $3 where id = $1", [row.id, options.push ?? true, options.email ?? true]);
  for (let i = 0; i < (options.devices ?? 1); i += 1) await saveSubscription(database.db, row.id, { endpoint: `https://push.example.com/${row.id}/${i}`, keys: KEYS }, null);
  return row;
}

async function placeWith(pusher: Pusher) {
  const push: PushConfig = { pusher, publicKey: "key" };
  const placed = await placeTestOrder(database, { push, overrides: { "contact.name": "Aisha Ramdin" } });
  const { rows } = await database.client.query<{ id: string; number: number }>("select id, number from orders where tracking_token = $1", [placed.token]);
  return rows[0]!;
}

async function alertEmails(template = "admin_alert_new_order") {
  const { rows } = await database.client.query<{ to_email: string; locale: string; status: string; payload: { orderId: string } }>(
    "select to_email, locale, status, payload from email_outbox where template = $1 order by to_email",
    [template],
  );
  return rows;
}

describe("new website order (AC1, AC8, AC11)", () => {
  test("each opted-in admin gets a push in their language and an admin_alert_new_order email row, with number and first name only", async () => {
    const en = await admin({ locale: "en" });
    const fr = await admin({ locale: "fr" });
    const pusher = new RecordingPusher();

    const order = await placeWith(pusher);

    const byEndpoint = new Map(pusher.sent.map((s) => [s.device.endpoint, s.payload]));
    expect(byEndpoint.get(`https://push.example.com/${en.id}/0`)).toEqual({
      title: `New order APB-${String(order.number).padStart(4, "0")}`,
      body: "From Aisha. Tap to approve or decline.",
      url: `/admin/orders/${order.id}`,
      tag: `new_order:${order.id}`,
    });
    expect(byEndpoint.get(`https://push.example.com/${fr.id}/0`)).toMatchObject({ title: `Nouvelle commande APB-${String(order.number).padStart(4, "0")}`, body: "De Aisha. Touchez pour accepter ou refuser." });
    expect((await alertEmails()).map((r) => [r.to_email, r.locale, r.payload.orderId])).toEqual(
      [[en.email, "en", order.id], [fr.email, "fr", order.id]].sort((a, b) => a[0]!.localeCompare(b[0]!)),
    );
  });

  test("no address, phone, surname or items ever reach the push (AC8)", async () => {
    await admin();
    const pusher = new RecordingPusher();

    await placeWith(pusher);

    const text = JSON.stringify(pusher.sent.map((s) => s.payload));
    expect(text).not.toMatch(/Ramdin|5712|\+230|Royal|Cake|cake/);
  });

  test("two devices of one admin and a second admin each get their own copy with the same collapsing tag (AC11)", async () => {
    await admin({ devices: 2 });
    await admin();
    const pusher = new RecordingPusher();

    const order = await placeWith(pusher);

    expect(pusher.sent).toHaveLength(3);
    expect(new Set(pusher.sent.map((s) => s.payload.tag))).toEqual(new Set([`new_order:${order.id}`]));
  });

  test("placing the same order again (replay) alerts nobody a second time", async () => {
    await admin();
    const pusher = new RecordingPusher();
    const order = await placeWith(pusher);

    expect(await queueNewOrderEmails(database.db, order.id)).toBe(0);
    expect(await alertEmails()).toHaveLength(1);
  });
});

describe("switches and deactivation (AC3, AC4, AC5, AC7)", () => {
  test("push off and email on: email only; both off: nothing; deactivated: nothing; no device: email still", async () => {
    const emailOnly = await admin({ push: false });
    const none = await admin({ push: false, email: false });
    const gone = await admin({ active: false });
    const noDevice = await admin({ devices: 0 });
    const pusher = new RecordingPusher();

    await placeWith(pusher);

    expect(pusher.sent).toHaveLength(0);
    const emailed = (await alertEmails()).map((r) => r.to_email);
    expect(emailed.sort()).toEqual([emailOnly.email, noDevice.email].sort());
    expect(emailed).not.toContain(none.email);
    expect(emailed).not.toContain(gone.email);
  });
});

describe("email outage (AC6)", () => {
  test("the push goes out at once while the alert email waits in the outbox for the sender", async () => {
    await admin();
    const pusher = new RecordingPusher();

    await placeWith(pusher);

    expect(pusher.sent).toHaveLength(1);
    expect((await alertEmails()).map((r) => r.status)).toEqual(["pending"]);
  });
});

describe("the other order events (AC2)", () => {
  test.each([
    ["new_request", "New custom request"],
    ["quote_accepted", "Quote accepted"],
    ["quote_declined", "Quote declined"],
    ["customer_cancelled", "Order cancelled"],
    ["quote_expired", "Quote expired"],
    ["pending_24h", "Waiting over 24 h"],
  ] as const)("%s pushes \"%s …\" opening the order, tagged by event", async (event, title) => {
    await admin();
    const order = await placeWith(new RecordingPusher());
    const pusher = new RecordingPusher();

    await pushOrderAlert(database.db, pusher, event, { orderId: order.id }, now);

    expect(pusher.sent[0]!.payload).toMatchObject({ url: `/admin/orders/${order.id}`, tag: `${event}:${order.id}` });
    expect(pusher.sent[0]!.payload.title.startsWith(title)).toBe(true);
  });

  test("every alert has its text in English and French", async () => {
    const { t } = await import("~/i18n/catalog.server");
    for (const event of ORDER_ALERTS) {
      for (const part of ["title", "body", "bodyNoName"]) {
        expect(t(`admin.push.${event}.${part}`, "fr")).not.toBe(t(`admin.push.${event}.${part}`, "en"));
      }
    }
  });

  test("an alert found by tracking token reaches the same admins (customer cancel)", async () => {
    await admin();
    await placeWith(new RecordingPusher());
    const { rows } = await database.client.query<{ tracking_token: string }>("select tracking_token from orders");
    const pusher = new RecordingPusher();

    await pushOrderAlert(database.db, pusher, "customer_cancelled", { trackingToken: rows[0]!.tracking_token }, now);

    expect(pusher.sent).toHaveLength(1);
  });
});

describe("manual orders (AC9)", () => {
  test("an order an admin keyed in raises no new-order alert, push or email", async () => {
    await admin();
    const order = await placeWith(new RecordingPusher());
    await database.client.query("delete from email_outbox where template = 'admin_alert_new_order'");
    await database.client.query("update orders set source = 'manual' where id = $1", [order.id]);
    const pusher = new RecordingPusher();

    expect((await pushOrderAlert(database.db, pusher, "new_order", { orderId: order.id }, now)).sent).toBe(0);
    expect(await queueNewOrderEmails(database.db, order.id)).toBe(0);
    expect(pusher.sent).toHaveLength(0);
  });
});
