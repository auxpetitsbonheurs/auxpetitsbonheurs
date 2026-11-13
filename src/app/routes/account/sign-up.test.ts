// S-206 `account/sign-up` signUp: no password field, no enumeration, RL-signup, resend limit.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action } from "./sign-up";

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

const DETAILS = { name: "Aisha Kowalski", phone: "5712 3456", locale: "en" };

function signUp(form: Record<string, string>, options: Partial<RouteArgsOptions> = {}) {
  return action(routeArgs(database, { path: "/account/sign-up", auth, form, headers: { "cf-connecting-ip": "203.0.113.9" }, ...options }) as never) as Promise<unknown>;
}

describe("a new email (AC1, AC5)", () => {
  test("creates an unconfirmed user with a random discarded password and says Check your email", async () => {
    const answer = await signUp({ ...DETAILS, email: " New@Example.com ", password: "attacker-chosen-1" });

    expect(answer).toMatchObject({ ok: true, email: "new@example.com" });
    expect(auth.signUps).toHaveLength(1);
    const made = auth.signUps[0]!;
    expect(made.metadata).toEqual({ name: "Aisha Kowalski", phone: "+23057123456", locale: "en" });
    expect(made.password).not.toBe("attacker-chosen-1");
    expect(made.password).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(made.redirectTo).toBe(`http://localhost/auth/confirm?next=${encodeURIComponent("/account/orders")}`);
    expect(auth.isConfirmed("new@example.com")).toBe(false);
  });

  test("a French sign-up confirms back to the French pages, and a same-site next is kept", async () => {
    await signUp({ ...DETAILS, locale: "fr", email: "fr@example.com", next: "/fr/reviews/write" }, { path: "/fr/account/sign-up" });
    expect(auth.signUps[0]!.redirectTo).toBe(`http://localhost/auth/confirm?next=${encodeURIComponent("/fr/reviews/write")}`);
  });
});

describe("no enumeration (AC4)", () => {
  test("an existing account gets a sign-in email instead; an admin's address gets nothing; the answers match", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const admin = await insertAdmin(database, auth);

    const forCustomer = await signUp({ ...DETAILS, email: customer.email });
    const forAdmin = await signUp({ ...DETAILS, email: admin.email });

    expect(forCustomer).toMatchObject({ ok: true });
    expect(forAdmin).toMatchObject({ ok: true });
    expect(auth.signUps).toEqual([]);
    expect(auth.signInLinks.map((l) => l.email)).toEqual([customer.email]);
    const shape = (answer: unknown) => Object.keys(answer as object).sort();
    expect(shape(forCustomer)).toEqual(shape(await signUp({ ...DETAILS, email: "fresh@example.com" })));
  });
});

describe("repeat sign-up for an unconfirmed email (AC7)", () => {
  test("only resends the confirmation, at most once a minute, and never makes a second user", async () => {
    await signUp({ ...DETAILS, email: "again@example.com" });
    await signUp({ ...DETAILS, email: "again@example.com" });
    await signUp({ ...DETAILS, email: "again@example.com" }, { now: "2026-11-10T08:01:30Z", headers: { "cf-connecting-ip": "203.0.113.10" } });

    expect(auth.signUps.map((s) => s.resent)).toEqual([false, true]);
  });
});

describe("limits and fields (AC6, AC8)", () => {
  test("the 4th sign-up in an hour from one IP is RATE_LIMITED with Retry-After", async () => {
    for (let i = 0; i < 3; i++) await signUp({ ...DETAILS, email: `n${i}@example.com` });

    const fourth = (await signUp({ ...DETAILS, email: "n4@example.com" })) as Envelope;

    expect(fourth.init.status).toBe(429);
    expect(fourth.data.error?.code).toBe("RATE_LIMITED");
    expect(Number(fourth.init.headers?.["Retry-After"])).toBeGreaterThan(0);
    expect(auth.signUps).toHaveLength(3);
  });

  test("bad email, phone and empty name give field messages and call Auth for nothing", async () => {
    const answer = (await signUp({ name: " ", email: "nope", phone: "12", locale: "en" })) as Envelope;

    expect(answer.init.status).toBe(400);
    expect(answer.data.error?.fields).toEqual({
      name: "Enter your name.",
      email: "Enter an email address like name@example.com.",
      phone: "Enter a phone number, e.g. 5712 3456",
    });
    expect(auth.signUps).toEqual([]);
  });

  test("French field messages on the French page (AC11)", async () => {
    const answer = (await signUp({ name: "A", email: "a@example.com", phone: "12", locale: "fr" }, { path: "/fr/account/sign-up" })) as Envelope;
    expect(answer.data.error?.fields?.phone).toBe("Saisissez un numéro de téléphone, par ex. 5712 3456");
  });
});
