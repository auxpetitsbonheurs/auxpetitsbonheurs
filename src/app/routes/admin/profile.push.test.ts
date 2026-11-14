// S-196: `admin/profile` subscribePush, unsubscribePush, sendTestPush; loader push config.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { PushConfig, PushDevice, PushPayload, Pusher } from "~/server/push/push.server";
import { base64UrlEncode } from "~/server/push/web-push.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./profile";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeEach(async () => {
  database = await createTestDatabase();
  session = await signedInAdmin(database, { role: "admin", name: "Sarah", locale: "fr" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

class RecordingPusher implements Pusher {
  sent: { device: PushDevice; payload: PushPayload }[] = [];
  async send(device: PushDevice, payload: PushPayload) {
    this.sent.push({ device, payload });
    return { outcome: "sent" as const, status: 201 };
  }
}

const PUBLIC_KEY = "B".repeat(87);

async function keys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { "keys.p256dh": base64UrlEncode(new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey))), "keys.auth": base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

function post(form: Record<string, string>, options: { cookie?: string; auth?: typeof session.auth; push?: PushConfig } = {}) {
  const args = routeArgs(database, { path: "/admin/profile", auth: options.auth ?? session.auth, cookie: options.cookie ?? session.cookie, form, push: options.push });
  return action(args as never) as Promise<unknown>;
}

async function load(push?: PushConfig) {
  return (await loader(routeArgs(database, { path: "/admin/profile", auth: session.auth, cookie: session.cookie, push }) as never)) as Record<string, unknown>;
}

async function endpoints(adminId = session.admin.id) {
  const { rows } = await database.client.query<{ endpoint: string }>("select endpoint from push_subscription where admin_id = $1 order by endpoint", [adminId]);
  return rows.map((r) => r.endpoint);
}

type Refusal = { data: { ok: false; intent?: string; error: { code: string } }; init: { status: number } };

describe("subscribePush (AC1)", () => {
  test("stores this device for the caller and pushDevices goes up by one; the same endpoint again is no duplicate", async () => {
    const device = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", ...(await keys()) };

    expect(await post({ intent: "subscribePush", ...device })).toEqual({ ok: true, intent: "subscribePush" });
    expect(await post({ intent: "subscribePush", ...device, ...(await keys()) })).toEqual({ ok: true, intent: "subscribePush" });

    expect(await endpoints()).toEqual([device.endpoint]);
    expect((await load()).pushDevices).toBe(1);
  });

  test("the loader gives the browser the VAPID public key, or null while push is not configured", async () => {
    expect((await load()).push).toEqual({ publicKey: null });
    expect((await load({ pusher: new RecordingPusher(), publicKey: PUBLIC_KEY })).push).toEqual({ publicKey: PUBLIC_KEY });
  });
});

describe("validation and access (AC5)", () => {
  test.each([
    ["a non-URL endpoint", { endpoint: "not a url" }],
    ["an http endpoint", { endpoint: "http://push.example.com/x" }],
    ["an IP endpoint", { endpoint: "https://10.0.0.1/x" }],
    ["missing keys", { "keys.p256dh": "", "keys.auth": "" }],
  ])("%s is VALIDATION_FAILED and nothing is stored", async (_name, override) => {
    const result = (await post({ intent: "subscribePush", endpoint: "https://push.example.com/x", ...(await keys()), ...override })) as Refusal;

    expect(result.init.status).toBe(400);
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(result.data.intent).toBe("subscribePush");
    expect(await endpoints()).toEqual([]);
  });

  test("an anonymous caller is sent to the admin login, a customer gets 403, and nothing is stored", async () => {
    const customer = await insertCustomerAccount(database, session.auth);
    const device = { intent: "subscribePush", endpoint: "https://push.example.com/x", ...(await keys()) };

    const anonymous = await post(device, { cookie: "" }).catch((error: unknown) => error);
    expect(anonymous).toBeInstanceOf(Response);
    expect((anonymous as Response).headers.get("Location")).toMatch(/^\/admin\/login/);
    const asCustomer = (await post(device, { cookie: session.auth.sessionCookie(customer.id, new Date("2026-11-09T08:00:00Z")) }).catch((error: unknown) => error)) as Refusal;
    expect(asCustomer.init.status).toBe(403);
    const { rows } = await database.client.query("select 1 from push_subscription");
    expect(rows).toHaveLength(0);
  });
});

describe("sendTestPush (AC2)", () => {
  test("pushes to the caller's own devices only, in the caller's language, and answers how many", async () => {
    const pusher = new RecordingPusher();
    const push = { pusher, publicKey: PUBLIC_KEY };
    await post({ intent: "subscribePush", endpoint: "https://push.example.com/mine-1", ...(await keys()) });
    await post({ intent: "subscribePush", endpoint: "https://push.example.com/mine-2", ...(await keys()) });
    const other = await insertAdmin(database, session.auth);
    await database.client.query("insert into push_subscription (admin_id, endpoint, p256dh, auth) values ($1, 'https://push.example.com/theirs', 'k', 'a')", [other.id]);

    const result = await post({ intent: "sendTestPush" }, { push });

    expect(result).toEqual({ ok: true, intent: "sendTestPush", sent: 2 });
    expect(pusher.sent.map((s) => s.device.endpoint).sort()).toEqual(["https://push.example.com/mine-1", "https://push.example.com/mine-2"]);
    expect(pusher.sent[0]!.payload).toMatchObject({ title: "Test de notification", url: "/admin/profile" });
  });

  test("with no device subscribed it answers sent 0 (the screen says so, AC4 of S-197)", async () => {
    expect(await post({ intent: "sendTestPush" }, { push: { pusher: new RecordingPusher(), publicKey: PUBLIC_KEY } })).toEqual({ ok: true, intent: "sendTestPush", sent: 0 });
  });

  test("while push is not configured nothing is sent and the answer says so", async () => {
    expect(await post({ intent: "sendTestPush" })).toEqual({ ok: true, intent: "sendTestPush", sent: 0, configured: false });
  });
});

describe("unsubscribePush (AC10)", () => {
  test("removes the caller's own device; another admin's endpoint is left alone", async () => {
    await post({ intent: "subscribePush", endpoint: "https://push.example.com/mine", ...(await keys()) });
    const other = await insertAdmin(database, session.auth);
    await database.client.query("insert into push_subscription (admin_id, endpoint, p256dh, auth) values ($1, 'https://push.example.com/theirs', 'k', 'a')", [other.id]);

    expect(await post({ intent: "unsubscribePush", endpoint: "https://push.example.com/theirs" })).toEqual({ ok: true, intent: "unsubscribePush" });
    expect(await post({ intent: "unsubscribePush", endpoint: "https://push.example.com/mine" })).toEqual({ ok: true, intent: "unsubscribePush" });

    expect(await endpoints()).toEqual([]);
    expect(await endpoints(other.id)).toEqual(["https://push.example.com/theirs"]);
  });
});
