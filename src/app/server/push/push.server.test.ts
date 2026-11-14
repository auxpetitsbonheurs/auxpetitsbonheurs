// S-196 AC4 (404/410 deletes, others still receive), AC6 (5 s timeout), AC7 (payload fields).
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { FakeAuth } from "~/server/testing/fake-auth";
import { insertAdmin } from "~/server/testing/admins";
import { type PushPayload, type Pusher, payloadJson, pushConfigFromEnv, sendPushes, webPusher } from "./push.server";
import { devicesOf, pushRecipients, saveSubscription } from "./subscriptions.server";
import { base64UrlEncode, generateVapidKeys } from "./web-push.server";

let database: TestDatabase;
const now = new Date("2026-11-13T10:00:00Z");
const payload: PushPayload = { title: "New order APB-0042", body: "Sarah", url: "/admin/orders/1", tag: "new_order:1" };

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function browserKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { p256dh: base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

async function adminWithDevices(endpoints: string[], options: Parameters<typeof insertAdmin>[2] = {}) {
  const { id } = await insertAdmin(database, new FakeAuth(), options);
  for (const endpoint of endpoints) await saveSubscription(database.db, id, { endpoint, keys: await browserKeys() }, "test");
  return id;
}

describe("sending (AC4)", () => {
  test("a 404 or 410 deletes that subscription and counts push_gone; the other device still receives", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const id = await adminWithDevices(["https://push.test/ok", "https://push.test/gone", "https://push.test/missing"]);
    const pusher: Pusher = { send: async (device) => ({ outcome: device.endpoint.endsWith("ok") ? "sent" : "gone", status: device.endpoint.endsWith("gone") ? 410 : 404 }) };

    const report = await sendPushes(database.db, pusher, "test", (await devicesOf(database.db, id)).map((device) => ({ device, payload })), now);

    expect(report).toEqual({ sent: 1, gone: 2, failed: 0 });
    expect((await devicesOf(database.db, id)).map((d) => d.endpoint)).toEqual(["https://push.test/ok"]);
    const lines = log.mock.calls.map(([line]) => JSON.parse(String(line)) as { event: string });
    expect(lines.filter((l) => l.event === "push_gone")).toHaveLength(2);
    expect(JSON.stringify(log.mock.calls)).not.toContain("push.test");
    log.mockRestore();
  });

  test("the web pusher maps the push service's answer: 201 sent, 410 gone, 500 failed", async () => {
    const keys = await generateVapidKeys();
    const statuses: Record<string, number> = { a: 201, b: 410, c: 500 };
    const fetch = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: statuses[String(url).slice(-1)]! }));
    const pusher = webPusher({ ...keys, subject: "mailto:owner@example.com" }, { fetch: fetch as typeof globalThis.fetch, now: () => now });
    const device = { id: "x", ...(await browserKeys()) };

    expect((await pusher.send({ ...device, endpoint: "https://push.test/a" }, payload)).outcome).toBe("sent");
    expect((await pusher.send({ ...device, endpoint: "https://push.test/b" }, payload)).outcome).toBe("gone");
    expect((await pusher.send({ ...device, endpoint: "https://push.test/c" }, payload)).outcome).toBe("failed");
    const init = fetch.mock.calls[0]![1] as RequestInit;
    expect(init.headers).toMatchObject({ "content-encoding": "aes128gcm", urgency: "high" });
    expect(String((init.headers as Record<string, string>).authorization)).toMatch(/^vapid t=.+, k=/);
  });
});

describe("timeout (AC6)", () => {
  test("a push service that does not answer within the limit is a timeout, not a hang", async () => {
    const keys = await generateVapidKeys();
    const never = () => new Promise<Response>(() => {});
    const pusher = webPusher({ ...keys, subject: "mailto:o@example.com" }, { fetch: never as typeof globalThis.fetch, now: () => now, timeoutMs: 20 });

    const result = await pusher.send({ id: "x", endpoint: "https://push.test/slow", ...(await browserKeys()) }, payload);

    expect(result.outcome).toBe("timeout");
  });
});

describe("payload (AC7)", () => {
  test("only title, body, url and tag are sent, whatever else a caller attached", () => {
    const leaky = { ...payload, address: "12 Royal Road", phone: "+23057123456", items: ["cake"] } as PushPayload;

    expect(Object.keys(JSON.parse(payloadJson(leaky)) as object)).toEqual(["title", "body", "url", "tag"]);
  });
});

describe("recipients (FR-046)", () => {
  test("only active admins with push on are recipients, with their locale", async () => {
    const on = await adminWithDevices(["https://push.test/on"], { locale: "fr" });
    const off = await adminWithDevices(["https://push.test/off"]);
    await database.client.query("update admin set alert_push = false where id = $1", [off]);
    await adminWithDevices(["https://push.test/inactive"], { active: false });

    const recipients = await pushRecipients(database.db);

    expect(recipients.map((r) => [r.adminId, r.locale, r.device.endpoint])).toEqual([[on, "fr", "https://push.test/on"]]);
  });
});

describe("configuration from env (AC8)", () => {
  test("off until all three VAPID values are real keys; placeholders keep push off and nothing logs a value", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const keys = await generateVapidKeys();

    expect(pushConfigFromEnv({}, () => now)).toEqual({ pusher: null, publicKey: null });
    const placeholders = { VAPID_PUBLIC_KEY: "replace-with-vapid-public-key", VAPID_PRIVATE_KEY: "replace-with-vapid-private-key", VAPID_SUBJECT: "mailto:o@example.com" };
    expect(pushConfigFromEnv(placeholders, () => now).pusher).toBeNull();
    const on = pushConfigFromEnv({ VAPID_PUBLIC_KEY: keys.publicKey, VAPID_PRIVATE_KEY: keys.privateKey, VAPID_SUBJECT: "mailto:o@example.com" }, () => now);
    expect(on.publicKey).toBe(keys.publicKey);
    expect(on.pusher).not.toBeNull();
    expect(JSON.stringify(log.mock.calls)).not.toContain(keys.privateKey);
    expect(JSON.stringify(log.mock.calls)).not.toContain("replace-with");
    log.mockRestore();
  });
});
