// S-209 password reset and S-206 AC2/AC3 first password on `account/reset`.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_PASSWORD, insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./reset";

let database: TestDatabase;
let auth: FakeAuth;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  auth = new FakeAuth();
  await database.client.query("delete from rate_limit_bucket");
});

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: boolean; error?: { code: string; fields?: Record<string, string> } }; init: { status: number; headers?: Record<string, string> } };

async function post(form: Record<string, string>, options: Partial<RouteArgsOptions> = {}): Promise<unknown> {
  try {
    return await action(routeArgs(database, { path: "/account/reset", auth, form, ...options }) as never);
  } catch (thrown) {
    return thrown;
  }
}

/** A session made by an emailed link `minutesAgo` before the test clock (2026-11-10T08:00Z). */
const linkSession = (userId: string, minutesAgo = 5) => auth.recoveryCookie(userId, new Date(Date.parse("2026-11-10T08:00:00Z") - minutesAgo * 60_000));

describe("request a reset (AC1, AC5)", () => {
  test("the same answer for a customer, an unknown address and an admin; only the customer gets a link", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const admin = await insertAdmin(database, auth);

    const answers = await Promise.all([customer.email, "nobody@example.com", admin.email].map((email) => post({ intent: "requestReset", email })));

    for (const answer of answers) expect(answer).toEqual({ ok: true, intent: "requestReset" });
    expect(auth.recoveryRequests.map((r) => r.email)).toEqual([customer.email, "nobody@example.com"]);
    expect(auth.recoveryRequests[0]!.redirectTo).toBe(`http://localhost/auth/confirm?next=${encodeURIComponent("/account/reset")}`);
  });

  test("the 6th request in 15 minutes for one email and IP is RATE_LIMITED", async () => {
    for (let i = 0; i < 5; i++) await post({ intent: "requestReset", email: "x@example.com" });
    const sixth = (await post({ intent: "requestReset", email: "x@example.com" })) as Envelope;
    expect(sixth.init.status).toBe(429);
    expect(sixth.init.headers?.["Retry-After"]).toBeDefined();
  });
});

describe("set the password (AC2, AC3, AC6)", () => {
  test("with a link session: the new password works, the old one stops, and next is followed", async () => {
    const customer = await insertCustomerAccount(database, auth);

    const response = (await post({ intent: "setPassword", password: "a much better one", next: "/account/orders" }, { cookie: linkSession(customer.id) })) as Response;

    expect(response.headers.get("Location")).toBe("/account/orders");
    expect(auth.passwordOf(customer.email)).toBe("a much better one");
    expect(auth.passwordOf(customer.email)).not.toBe(TEST_PASSWORD);
    expect(auth.otherSessionsEnded).toEqual([customer.id]);
  });

  test("9 characters: VALIDATION_FAILED with the hint wording, nothing changes", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const answer = (await post({ intent: "setPassword", password: "123456789" }, { cookie: linkSession(customer.id) })) as Envelope;
    expect(answer.init.status).toBe(400);
    expect(answer.data.error?.fields?.password).toBe("Use at least 10 characters.");
    expect(auth.passwordOf(customer.email)).toBe(TEST_PASSWORD);
  });

  test.each([
    ["no session", () => undefined],
    ["an ordinary password session", (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:59:00Z"))],
    ["a link used more than an hour ago", (id: string) => linkSession(id, 61)],
  ])("%s: LINK_EXPIRED and nothing changes", async (_name, cookieFor) => {
    const customer = await insertCustomerAccount(database, auth);
    const answer = (await post({ intent: "setPassword", password: "a much better one" }, { cookie: cookieFor(customer.id) })) as Envelope;
    expect(answer.data.error?.code).toBe("LINK_EXPIRED");
    expect(auth.passwordUpdates).toEqual([]);
  });

  test("an admin's recovery session cannot set a password here", async () => {
    const admin = await insertAdmin(database, auth);
    const answer = (await post({ intent: "setPassword", password: "a much better one" }, { cookie: linkSession(admin.id) })) as Envelope;
    expect(answer.data.error?.code).toBe("LINK_EXPIRED");
  });
});

describe("loader", () => {
  test("a link session shows the first-password form for mode=new; otherwise the request form", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const set = await loader(routeArgs(database, { path: "/account/reset?mode=new&next=/account/orders", auth, cookie: linkSession(customer.id) }) as never);
    const request = await loader(routeArgs(database, { path: "/account/reset?expired=1", auth }) as never);
    expect(set).toMatchObject({ state: "set", firstPassword: true, next: "/account/orders", title: "Choose a password" });
    expect(request).toMatchObject({ state: "request", expired: true });
  });
});
