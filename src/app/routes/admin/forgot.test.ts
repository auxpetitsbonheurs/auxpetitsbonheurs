// S-025: ask for a password reset link (`admin/forgot` requestReset).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./forgot";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(() => {
  auth = new FakeAuth();
});

afterAll(async () => {
  await database.close();
});

afterEach(() => {
  vi.restoreAllMocks();
});

type Envelope = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> }; retryAfterMinutes?: number }; init: { status: number; headers?: Record<string, string> } };

function post(email: string, options: Partial<RouteArgsOptions> = {}) {
  return action(routeArgs(database, { path: "/admin/forgot", auth, form: { email }, ...options }) as never) as Promise<unknown>;
}

describe("an active admin's email (AC1)", () => {
  test("answers { ok } and requests a recovery email back to /admin/reset", async () => {
    const admin = await insertAdmin(database, auth);

    const result = await post(`  ${admin.email.toUpperCase()} `);

    expect(result).toMatchObject({ ok: true });
    expect(auth.recoveryRequests).toEqual([{ email: admin.email, redirectTo: "http://localhost/admin/reset" }]);
  });

  test("an Auth failure is logged without the address and the answer stays the same", async () => {
    const admin = await insertAdmin(database, auth);
    auth.failing = true;
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    const result = await post(admin.email);

    expect(result).toMatchObject({ ok: true });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("auth_recovery_request"));
    expect(JSON.stringify(log.mock.calls)).not.toContain(admin.email);
  });
});

describe("no enumeration (AC2)", () => {
  test("unknown, customer-only and deactivated emails answer exactly like an admin's, and request nothing", async () => {
    const admin = await insertAdmin(database, auth);
    const inactive = await insertAdmin(database, auth, { active: false });
    const customer = await insertCustomerAccount(database, auth);

    const known = await post(admin.email);
    auth.recoveryRequests.length = 0;
    const others = await Promise.all([post("nobody@example.com"), post(customer.email), post(inactive.email)]);

    for (const [result, email] of others.map((r, i) => [r, ["nobody@example.com", customer.email, inactive.email][i]] as const)) {
      expect(result).toEqual({ ok: true, values: { email } });
    }
    expect(known).toEqual({ ok: true, values: { email: admin.email } });
    expect(auth.recoveryRequests).toEqual([]);
  });
});

describe("field errors (AC3)", () => {
  test.each([
    ["", "Enter your email address."],
    ["sarah@", "Enter an email address, for example name@example.com."],
  ])("%j shows only a field error and requests nothing", async (email, message) => {
    const before = await database.client.query("select 1 from rate_limit_bucket");
    const result = (await post(email)) as Envelope;

    expect(result.init.status).toBe(400);
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(result.data.error.fields).toEqual({ email: message });
    expect(auth.recoveryRequests).toEqual([]);
    const after = await database.client.query("select 1 from rate_limit_bucket");
    expect(after.rows.length).toBe(before.rows.length);
  });
});

describe("RL-auth (AC4)", () => {
  test("the 6th request in 15 minutes from one IP for one email is RATE_LIMITED, known or unknown", async () => {
    const admin = await insertAdmin(database, auth);
    const headers = { "cf-connecting-ip": "198.51.100.7" };

    for (const email of [admin.email, "nobody@example.com"]) {
      for (let i = 0; i < 5; i++) expect(await post(email, { headers })).toMatchObject({ ok: true });
      const limited = (await post(email, { headers })) as Envelope;
      expect(limited.init.status).toBe(429);
      expect(limited.data.error).toEqual({ code: "RATE_LIMITED", message: "Too many attempts, wait a few minutes." });
      expect(limited.init.headers).toMatchObject({ "Retry-After": expect.any(String) });
    }
    expect(auth.recoveryRequests).toHaveLength(5);
  });
});

describe("French (AC8)", () => {
  test("the title and the field error follow the visitor's language", async () => {
    const loaded = loader(routeArgs(database, { path: "/admin/forgot", auth, cookie: "apb_locale=fr" }) as never);
    const refused = (await post("", { cookie: "apb_locale=fr" })) as Envelope;

    expect(loaded.title).toBe("Réinitialiser le mot de passe");
    expect(refused.data.error.fields).toEqual({ email: "Saisissez votre adresse e-mail." });
    expect(refused.data.error.message).not.toBe("Some details need checking. Please correct the fields listed below.");
  });
});
