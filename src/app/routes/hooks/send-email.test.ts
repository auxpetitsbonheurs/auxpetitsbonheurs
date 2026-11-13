// S-024: the Supabase Auth Send Email hook, with a fake mailer (no network).
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { emailContext } from "~/server/email/context.server";
import type { EmailMessage, Mailer } from "~/server/email/sender.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { action } from "./send-email";

const SITE = "https://shop.test";
const NOW = new Date("2026-11-10T08:00:00Z");
// Placeholder secrets made from fixed test strings at run time, never real ones.
const SECRET_BYTES = btoa("test-hook-secret-not-real");
const SECRET = `v1,whsec_${SECRET_BYTES}`;

let database: TestDatabase;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);


afterAll(async () => {
  await database.close();
});


class FakeMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  mode: "ok" | "fail" | "hang" = "ok";
  async send(message: EmailMessage) {
    if (this.mode === "fail") throw new Error("provider said: invalid key re_123 for owner@example.com");
    if (this.mode === "hang") await new Promise(() => {});
    this.sent.push(message);
    return { id: `email-${this.sent.length}` };
  }
}

async function sign(id: string, timestamp: number, body: string, secretBytes = SECRET_BYTES): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secretBytes), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(mac)))}`;
}

interface Delivery {
  payload?: Record<string, unknown>;
  id?: string;
  timestamp?: number;
  signature?: string;
  mailer?: FakeMailer | null;
  secret?: string | null;
  timeoutMs?: number;
}

function payload(overrides: { locale?: unknown; redirectTo?: string; type?: string; userId?: string } = {}) {
  return {
    user: { id: overrides.userId ?? "5b3e1f0a-2c4d-4e5f-8a9b-0c1d2e3f4a5b", email: "sarah@example.com", user_metadata: overrides.locale === undefined ? {} : { locale: overrides.locale } },
    email_data: {
      token: "123456",
      token_hash: "linkhash",
      redirect_to: overrides.redirectTo ?? `${SITE}/admin/reset`,
      email_action_type: overrides.type ?? "recovery",
      site_url: SITE,
    },
  };
}

async function deliver(delivery: Delivery = {}) {
  const body = JSON.stringify(delivery.payload ?? payload());
  const id = delivery.id ?? `msg_${randomUUID()}`;
  const timestamp = delivery.timestamp ?? Math.floor(NOW.getTime() / 1000);
  const signature = delivery.signature ?? (await sign(id, timestamp, body));
  const args = routeArgs(database, { path: "/hooks/supabase/send-email", auth: new FakeAuth(), now: NOW.toISOString() });
  const request = new Request(`${SITE}/hooks/supabase/send-email`, {
    method: "POST",
    headers: { "content-type": "application/json", "webhook-id": id, "webhook-timestamp": String(timestamp), "webhook-signature": signature },
    body,
  });
  args.context.set(emailContext, {
    mailer: delivery.mailer === undefined ? new FakeMailer() : delivery.mailer,
    hookSecret: delivery.secret === undefined ? SECRET : delivery.secret,
    timeoutMs: delivery.timeoutMs ?? 8000,
  });
  const response = (await action({ ...args, request, url: new URL(request.url) } as never)) as Response;
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

describe("a signed recovery delivery (AC1)", () => {
  test("sends one French email whose link goes through /auth/confirm to /admin/reset", async () => {
    const mailer = new FakeMailer();

    const result = await deliver({ payload: payload({ locale: "fr" }), mailer });

    expect(result).toEqual({ status: 200, body: {} });
    expect(mailer.sent).toHaveLength(1);
    const [email] = mailer.sent;
    expect(email!.to).toBe("sarah@example.com");
    expect(email!.subject).toMatch(/Réinitialiser/);
    expect(email!.text).toContain(`${SITE}/auth/confirm?token_hash=linkhash&type=recovery&next=/admin/reset`);
    expect(email!.html).toContain(`${SITE}/auth/confirm?token_hash=linkhash&amp;type=recovery&amp;next=/admin/reset`);
  });

  test("without a locale in the metadata, an admin gets their own language", async () => {
    const auth = new FakeAuth();
    const admin = await insertAdmin(database, auth, { locale: "fr" });
    const mailer = new FakeMailer();

    await deliver({ payload: payload({ userId: admin.id }), mailer });

    expect(mailer.sent[0]!.subject).toMatch(/Réinitialiser/);
  });
});

describe("signature and freshness (AC2)", () => {
  test.each([
    ["a bad signature", { signature: "v1,AAAA" }],
    ["a signature made with another secret", { secret: `v1,whsec_${btoa("other-secret")}` }],
    ["a timestamp more than 5 minutes old", { timestamp: Math.floor(NOW.getTime() / 1000) - 301 }],
    ["a timestamp more than 5 minutes ahead", { timestamp: Math.floor(NOW.getTime() / 1000) + 301 }],
  ])("%s is 401 and sends nothing", async (_name, delivery) => {
    const mailer = new FakeMailer();
    const body = JSON.stringify(payload());
    const timestamp = (delivery as Delivery).timestamp ?? Math.floor(NOW.getTime() / 1000);
    // A stale delivery is still correctly signed: only its age is wrong.
    const signature = (delivery as Delivery).signature ?? (await sign("msg_stale", timestamp, body));

    const result = await deliver({ ...delivery, id: "msg_stale", timestamp, signature, mailer });

    expect(result.status).toBe(401);
    expect(mailer.sent).toEqual([]);
  });
});

describe("redirect allowlist (AC3)", () => {
  test.each([
    ["another origin", "https://evil.example/admin/reset"],
    ["a look-alike origin", "https://shop.test.evil.example/admin/reset"],
    ["an absolute next", `${SITE}/auth/confirm?next=https://evil.example`],
    ["a protocol-relative next", `${SITE}/auth/confirm?next=//evil.example`],
    ["not a URL", "admin/reset"],
  ])("%s is 500 with the error envelope and sends nothing", async (_name, redirectTo) => {
    const mailer = new FakeMailer();

    const result = await deliver({ payload: payload({ redirectTo }), mailer });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { http_code: 500, message: expect.any(String) } });
    expect(mailer.sent).toEqual([]);
  });
});

describe("provider failure (AC5)", () => {
  test("a failing provider is 500 with a safe message: no key, no address, no provider text", async () => {
    const mailer = new FakeMailer();
    mailer.mode = "fail";

    const result = await deliver({ mailer });

    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: { http_code: 500, message: "Email could not be sent." } });
    expect(JSON.stringify(result.body)).not.toMatch(/re_123|example\.com|provider/);
  });

  test("a provider that does not answer in time is 500", async () => {
    const mailer = new FakeMailer();
    mailer.mode = "hang";

    const result = await deliver({ mailer, timeoutMs: 20 });

    expect(result).toEqual({ status: 500, body: { error: { http_code: 500, message: "Email could not be sent." } } });
  });

  test("without Resend keys the hook fails soft the same way; without its secret it refuses", async () => {
    expect((await deliver({ mailer: null })).body).toEqual({ error: { http_code: 500, message: "Email could not be sent." } });
    expect((await deliver({ secret: null, id: "msg_2" })).status).toBe(500);
  });

  test("a failed send can be retried with the same webhook-id", async () => {
    const mailer = new FakeMailer();
    mailer.mode = "fail";
    await deliver({ mailer, id: "msg_retry" });
    mailer.mode = "ok";

    expect((await deliver({ mailer, id: "msg_retry" })).status).toBe(200);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("dedupe (AC6)", () => {
  test("the same webhook-id twice sends one email and answers 200 both times", async () => {
    const mailer = new FakeMailer();

    const first = await deliver({ mailer, id: "msg_1" });
    const second = await deliver({ mailer, id: "msg_1" });

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(mailer.sent).toHaveLength(1);
    const rows = await database.client.query<{ status: string; payload: unknown }>("select status, payload from email_outbox where dedupe_key = 'auth-hook:msg_1'");
    expect(rows.rows).toEqual([{ status: "sent", payload: {} }]);
  });
});

describe("customer emails (E-11: S-206 signup, S-208 sign-in link, S-209 reset)", () => {
  test.each([
    ["signup", "fr", "Confirmez votre e-mail pour Aux petits bonheurs", "/account/orders"],
    ["magiclink", "en", "Your Aux petits bonheurs sign-in link", "/reviews/write"],
    ["recovery", "en", "Reset your Aux petits bonheurs password", "/account/reset"],
  ])("%s in %s: the customer wording and a link to /auth/confirm with that next", async (type, locale, subject, next) => {
    const mailer = new FakeMailer();

    const result = await deliver({ payload: payload({ type, locale, userId: randomUUID(), redirectTo: `${SITE}/auth/confirm?next=${encodeURIComponent(next)}` }), mailer });

    expect(result.status).toBe(200);
    expect(mailer.sent[0]?.subject).toBe(subject);
    expect(mailer.sent[0]?.text).toContain(`${SITE}/auth/confirm?token_hash=linkhash&type=${type}&next=${next}`);
    expect(mailer.sent[0]?.text).not.toContain("admin");
  });
});

describe("unsupported types (AC8)", () => {
  test.each(["email_change", "invite"])("%s is 500 unsupported and sends nothing", async (type) => {
    const mailer = new FakeMailer();

    const result = await deliver({ payload: payload({ type }), mailer });

    expect(result).toEqual({ status: 500, body: { error: { http_code: 500, message: "unsupported" } } });
    expect(mailer.sent).toEqual([]);
  });
});
