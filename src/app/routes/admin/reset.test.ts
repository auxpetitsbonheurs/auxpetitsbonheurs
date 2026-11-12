// S-026: set a new password from the recovery link (`admin/reset` setPassword).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_PASSWORD, insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { loader as homeLoader } from "./home";
import { action, loader } from "./reset";

let database: TestDatabase;
let auth: FakeAuth;

const NOW = "2026-11-10T08:00:00Z";
const NEW_PASSWORD = "a new long password";

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(() => {
  auth = new FakeAuth();
});

afterAll(async () => {
  await database.close();
});


type Envelope = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

/** A recovery session that used its link `minutesAgo` minutes before NOW. */
function recovery(userId: string, minutesAgo = 5): string {
  return auth.recoveryCookie(userId, new Date(Date.parse(NOW) - minutesAgo * 60_000));
}

function post(password: string, cookie: string | undefined, options: Partial<RouteArgsOptions> = {}) {
  return action(routeArgs(database, { path: "/admin/reset", auth, cookie, now: NOW, form: { password }, ...options }) as never) as Promise<unknown>;
}

function load(cookie?: string) {
  return loader(routeArgs(database, { path: "/admin/reset", auth, cookie, now: NOW }) as never) as Promise<unknown>;
}

describe("set the password and carry on (AC2)", () => {
  test("a 10-character password is set, the recovery session ends and a fresh one lands on Today", async () => {
    const admin = await insertAdmin(database, auth);

    const response = (await post(NEW_PASSWORD, recovery(admin.id))) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin");
    expect(auth.passwordOf(admin.email)).toBe(NEW_PASSWORD);
    expect(auth.signOuts).toEqual([admin.id]);
    const cookies = response.headers.getSetCookie();
    // The recovery cookie is cleared first, then the new ordinary session is set (not a recovery one).
    expect(cookies.at(-1)).toMatch(new RegExp(`^apb_fake_session=${admin.id}~\\d+; `));
    expect(cookies.at(-1)).not.toContain("recovery");
  });

  test("lead decision 2026-11-12: the new password signs every other device out (a lost phone loses its session)", async () => {
    const admin = await insertAdmin(database, auth);

    await post(NEW_PASSWORD, recovery(admin.id));

    expect(auth.otherSessionsEnded).toEqual([admin.id]);
  });

  test("the loader shows the admin's email for a fresh recovery session", async () => {
    const admin = await insertAdmin(database, auth);

    expect(await load(recovery(admin.id))).toMatchObject({ expired: false, email: admin.email });
  });
});

describe("a recovery session is not an admin session (security review)", () => {
  test("it cannot open other admin pages before a password is chosen", async () => {
    const admin = await insertAdmin(database, auth);
    let outcome: unknown;
    try {
      await homeLoader(routeArgs(database, { path: "/admin", auth, cookie: recovery(admin.id), now: NOW }) as never);
    } catch (thrown) {
      outcome = thrown;
    }

    expect((outcome as Response).headers.get("Location")).toBe("/admin/login?next=%2Fadmin");
  });
});

describe("password rule (AC3)", () => {
  test.each(["", "123456789"])("%j is VALIDATION_FAILED on password and nothing changes", async (password) => {
    const admin = await insertAdmin(database, auth);

    const result = (await post(password, recovery(admin.id))) as Envelope;

    expect(result.init.status).toBe(400);
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(result.data.error.fields).toEqual({ password: "At least 10 characters" });
    expect(auth.passwordOf(admin.email)).toBe(TEST_PASSWORD);
  });

  test("a password Auth refuses (same as before) is a field error, calmly", async () => {
    const admin = await insertAdmin(database, auth);

    const result = (await post(TEST_PASSWORD, recovery(admin.id))) as Envelope;

    expect(result.data.error.fields?.password).toMatch(/Choose another password/);
  });
});

describe("expired, used or missing link (AC4)", () => {
  const expired = { code: "LINK_EXPIRED", message: "This link has expired. Request a new one." };

  test("no session, an ordinary session or a recovery older than an hour: the page is 410", async () => {
    const admin = await insertAdmin(database, auth);
    const ordinary = auth.sessionCookie(admin.id, new Date(Date.parse(NOW) - 60_000));

    for (const cookie of [undefined, ordinary, recovery(admin.id, 61)]) {
      const result = (await load(cookie)) as { data: { expired: boolean }; init: { status: number } };
      expect(result.init.status).toBe(410);
      expect(result.data.expired).toBe(true);
    }
  });

  test("submitting without a recovery session is 410 LINK_EXPIRED and changes nothing", async () => {
    const admin = await insertAdmin(database, auth);

    for (const cookie of [undefined, recovery(admin.id, 61)]) {
      const result = (await post(NEW_PASSWORD, cookie)) as Envelope;
      expect(result.init.status).toBe(410);
      expect(result.data.error).toEqual(expired);
    }
    expect(auth.passwordOf(admin.email)).toBe(TEST_PASSWORD);
  });
});

describe("not an active admin (AC5)", () => {
  test("a customer or a deactivated admin gets the same generic answer, no password change and no session", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const inactive = await insertAdmin(database, auth, { active: false });

    for (const account of [customer, inactive]) {
      const result = (await post(NEW_PASSWORD, recovery(account.id))) as Envelope;
      expect(result.init.status).toBe(410);
      expect(result.data.error.code).toBe("LINK_EXPIRED");
      expect(auth.passwordOf(account.email)).toBe(TEST_PASSWORD);
    }
    expect(auth.signOuts).toEqual([customer.id, inactive.id]);
  });
});

describe("RL-auth (AC7)", () => {
  test("the 6th submission in 15 minutes is RATE_LIMITED with the wait message", async () => {
    const admin = await insertAdmin(database, auth);
    const headers = { "cf-connecting-ip": "198.51.100.9" };

    for (let i = 0; i < 5; i++) await post(TEST_PASSWORD, recovery(admin.id), { headers });
    const limited = (await post(NEW_PASSWORD, recovery(admin.id), { headers })) as Envelope;

    expect(limited.init.status).toBe(429);
    expect(limited.data.error.message).toBe("Too many attempts, wait a few minutes.");
    expect(auth.passwordOf(admin.email)).toBe(TEST_PASSWORD);
  });
});
