// S-207 (password sign-in) and S-208 (one-time link) on `account/sign-in`.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_PASSWORD, insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./sign-in";

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

type Envelope = { data: { ok: boolean; error?: { code: string; fields?: Record<string, string> }; retryAfterMinutes?: number }; init: { status: number; headers?: Record<string, string> } };

async function post(form: Record<string, string>, options: Partial<RouteArgsOptions> = {}): Promise<unknown> {
  try {
    return await action(routeArgs(database, { path: "/account/sign-in", auth, form, ...options }) as never);
  } catch (thrown) {
    return thrown;
  }
}

const password = (email: string, pw: string, next?: string) => post({ intent: "password", email, password: pw, ...(next ? { next } : {}) });

describe("password sign-in (S-207 AC1)", () => {
  test("a confirmed customer lands on next, with the session and the signed-in hint", async () => {
    const customer = await insertCustomerAccount(database, auth);

    const response = (await password(customer.email, TEST_PASSWORD, "/account/orders")) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/account/orders");
    const cookies = response.headers.getSetCookie().join("\n");
    expect(cookies).toContain("apb_fake_session=");
    expect(cookies).toMatch(/apb_customer=1; Path=\/; HttpOnly; Secure; SameSite=Lax/);
  });

  test("no next: the account page in the page's language", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const response = (await post({ intent: "password", email: customer.email, password: TEST_PASSWORD }, { path: "/fr/account/sign-in" })) as Response;
    expect(response.headers.get("Location")).toBe("/fr/account");
  });
});

describe("one generic refusal (S-207 AC2, AC8)", () => {
  test("wrong password, unknown email and an admin's own credentials all answer INVALID_CREDENTIALS alike", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const admin = await insertAdmin(database, auth);

    const answers = (await Promise.all([password(customer.email, "wrong password!"), password("nobody@example.com", TEST_PASSWORD), password(admin.email, TEST_PASSWORD)])) as Envelope[];

    for (const answer of answers) {
      expect(answer.init.status).toBe(401);
      expect(answer.data.error?.code).toBe("INVALID_CREDENTIALS");
      expect(answer.init.headers).toBeUndefined();
    }
    expect(JSON.stringify(answers[0]!.data)).toEqual(JSON.stringify(answers[1]!.data).replace("nobody@example.com", customer.email));
  });
});

describe("rate limit (S-207 AC3)", () => {
  test("the 6th try in 15 minutes for one email and IP is RATE_LIMITED with Retry-After", async () => {
    const customer = await insertCustomerAccount(database, auth);
    for (let i = 0; i < 5; i++) await password(customer.email, "wrong password!");

    const sixth = (await password(customer.email, TEST_PASSWORD)) as Envelope;

    expect(sixth.init.status).toBe(429);
    expect(sixth.data.error?.code).toBe("RATE_LIMITED");
    expect(Number(sixth.init.headers?.["Retry-After"])).toBeGreaterThan(0);
    expect(sixth.data.retryAfterMinutes).toBeGreaterThanOrEqual(1);
  });
});

describe("next is same-site only (S-207 AC4)", () => {
  test.each(["https://evil.example/", "//evil.example", "/\\evil.example", "/admin", "/admin/team", "/%2F/evil.example", "/auth/confirm"])("next=%j lands on /account", async (next) => {
    const customer = await insertCustomerAccount(database, auth);
    const response = (await password(customer.email, TEST_PASSWORD, next)) as Response;
    expect(response.headers.get("Location")).toBe("/account");
  });

  test("a same-site path with a query is honoured", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const response = (await password(customer.email, TEST_PASSWORD, "/fr/reviews/write?x=1")) as Response;
    expect(response.headers.get("Location")).toBe("/fr/reviews/write?x=1");
  });
});

describe("field problems (S-207 AC10)", () => {
  test("empty email and password: VALIDATION_FAILED with both fields, and no Auth attempt", async () => {
    const answer = (await password("", "")) as Envelope;
    expect(answer.init.status).toBe(400);
    expect(Object.keys(answer.data.error?.fields ?? {}).sort()).toEqual(["email", "password"]);
    expect(auth.attempts).toEqual([]);
  });

  test("a cross-site POST is refused before anything else", async () => {
    const refused = (await post({ intent: "password", email: "a@example.com", password: "x" }, { origin: "https://evil.example" })) as Envelope;
    expect(refused.init.status).toBe(403);
    expect(auth.attempts).toEqual([]);
  });
});

describe("loader", () => {
  test("a signed-in customer goes straight on to next", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-10T07:00:00Z"));
    const thrown = await loader(routeArgs(database, { path: "/account/sign-in?next=/account/orders", auth, cookie }) as never).catch((e: unknown) => e);
    expect((thrown as Response).headers.get("Location")).toBe("/account/orders");
  });

  test("shows the link method and the expired notice from the query", async () => {
    const data = await loader(routeArgs(database, { path: "/account/sign-in?method=link&link=expired", auth }) as never);
    expect(data).toMatchObject({ method: "link", linkExpired: true, next: "/account" });
  });
});

describe("one-time link (S-208)", () => {
  const link = (email: string, next?: string) => post({ intent: "magicLink", email, ...(next ? { next } : {}) });

  test("always the same answer; only an existing customer gets a link, back to next (AC1, AC2)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const admin = await insertAdmin(database, auth);

    const known = await link(customer.email, "/reviews/write");
    const unknown = await link("nobody@example.com");
    const adminAnswer = await link(admin.email);

    for (const answer of [known, unknown, adminAnswer]) expect(answer).toMatchObject({ ok: true, intent: "magicLink" });
    expect(auth.signInLinks).toEqual([{ email: customer.email, redirectTo: `http://localhost/auth/confirm?next=${encodeURIComponent("/reviews/write")}` }]);
    expect(auth.hasUser("nobody@example.com")).toBe(false);
  });

  test("a second request within a minute sends nothing more and answers the same (AC5)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await link(customer.email);
    expect(await link(customer.email)).toMatchObject({ ok: true });
    expect(auth.signInLinks).toHaveLength(1);
  });

  test("the 6th request in 15 minutes is RATE_LIMITED; a bad email is a field error (AC6)", async () => {
    for (let i = 0; i < 5; i++) await link("someone@example.com");
    const sixth = (await link("someone@example.com")) as Envelope;
    expect(sixth.data.error?.code).toBe("RATE_LIMITED");

    const bad = (await link("not-an-email")) as Envelope;
    expect(bad.data.error?.fields?.email).toBe("Enter an email address like name@example.com.");
  });
});
