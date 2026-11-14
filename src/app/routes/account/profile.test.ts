// S-210 `account/profile` and the customer guard (S-207 AC5, AC7, AC8).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { CUSTOMER_SESSION_MAX_AGE_MS } from "~/server/customer-auth.server";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { placeTestOrder } from "~/server/testing/orders";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./profile";

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

type Envelope = { data: { ok: boolean; error?: { code: string; fields?: Record<string, string> } }; init: { status: number } };

const session = (id: string) => auth.sessionCookie(id, new Date("2026-11-10T07:00:00Z"));

async function run<T>(work: () => Promise<T>): Promise<T | Response> {
  try {
    return await work();
  } catch (thrown) {
    if (thrown instanceof Response) return thrown;
    if (thrown && typeof thrown === "object" && "init" in thrown) return thrown as T;
    throw thrown;
  }
}

const load = (options: Partial<RouteArgsOptions>) => run(() => loader(routeArgs(database, { path: "/account", auth, ...options }) as never));
const save = (form: Record<string, string>, options: Partial<RouteArgsOptions>) => run(() => action(routeArgs(database, { path: "/account", auth, form, ...options }) as never));

describe("the guard (S-207 AC5, AC7, AC8; S-210 AC6)", () => {
  test("an anonymous visitor is sent to sign-in with next", async () => {
    const response = (await load({ path: "/fr/account" })) as Response;
    expect(response.headers.get("Location")).toBe(`/fr/account/sign-in?next=${encodeURIComponent("/fr/account")}`);
  });

  test("an expired or stale session: redirect, and the signed-in hint is cleared", async () => {
    const response = (await load({ cookie: "apb_customer=1" })) as Response;
    expect(response.headers.get("Location")).toContain("/account/sign-in?next=");
    expect(response.headers.get("Set-Cookie")).toContain("apb_customer=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  });

  test("SEC-11: a customer sign-in older than the maximum age is ended (sign in again); one just inside it still works", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const signedIn = new Date("2026-11-10T07:00:00Z");
    const cookie = auth.sessionCookie(customer.id, signedIn);
    const justInside = new Date(signedIn.getTime() + CUSTOMER_SESSION_MAX_AGE_MS).toISOString();
    const justAfter = new Date(signedIn.getTime() + CUSTOMER_SESSION_MAX_AGE_MS + 1000).toISOString();
    expect((await load({ cookie, now: justInside })) as unknown).not.toBeInstanceOf(Response);
    const expired = (await load({ cookie: `${cookie}; apb_customer=1`, now: justAfter })) as Response;
    expect(expired.headers.get("Location")).toContain("/account/sign-in?next=");
    const post = (await save({ name: "X", phone: "5712 3456", locale: "en" }, { cookie, now: justAfter })) as Envelope;
    expect(post.data.error?.code).toBe("UNAUTHENTICATED");
  });

  test("an admin session gets no customer data: redirect on a page, FORBIDDEN on an action", async () => {
    const admin = await insertAdmin(database, auth);
    const page = (await load({ cookie: session(admin.id) })) as Response;
    const post = (await save({ name: "X", phone: "5712 3456", locale: "en" }, { cookie: session(admin.id) })) as Envelope;
    expect(page.status).toBe(302);
    expect(post.init.status).toBe(403);
    expect(post.data.error?.code).toBe("FORBIDDEN");
  });

  test("an anonymous action is UNAUTHENTICATED and writes nothing", async () => {
    const post = (await save({ name: "X", phone: "5712 3456", locale: "en" }, {})) as Envelope;
    expect(post.init.status).toBe(401);
  });
});

describe("profile (S-210)", () => {
  test("shows the own row with the confirmed email read-only (AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const data = await load({ cookie: session(customer.id) });
    expect(data).toMatchObject({ profile: { name: "Cliente", phone: "+23057000000", email: customer.email, locale: "en" } });
  });

  test("saving '5712 3456' stores +23057123456; the email in the form is ignored (AC1, AC4)", async () => {
    const customer = await insertCustomerAccount(database, auth);

    const answer = await save({ name: " Aisha K ", phone: "5712 3456", locale: "en", email: "other@example.com" }, { cookie: session(customer.id) });

    expect(answer).toMatchObject({ ok: true });
    const { rows } = await database.client.query("select name, phone, email from customer where auth_user_id = $1", [customer.id]);
    expect(rows[0]).toEqual({ name: "Aisha K", phone: "+23057123456", email: customer.email });
  });

  test("a new language moves to the twin page and is remembered (AC2)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const response = (await save({ name: "Aisha", phone: "5712 3456", locale: "fr" }, { cookie: session(customer.id) })) as Response;
    expect(response.headers.get("Location")).toBe("/fr/account?saved=1");
    expect(response.headers.get("Set-Cookie")).toContain("apb_locale=fr");
    const { rows } = await database.client.query("select locale from customer where auth_user_id = $1", [customer.id]);
    expect(rows[0]).toEqual({ locale: "fr" });
  });

  test("invalid phone or empty name: field errors and nothing saved (AC3)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const answer = (await save({ name: "", phone: "12", locale: "en" }, { cookie: session(customer.id) })) as Envelope;
    expect(answer.init.status).toBe(400);
    expect(Object.keys(answer.data.error?.fields ?? {}).sort()).toEqual(["name", "phone"]);
    const { rows } = await database.client.query("select name from customer where auth_user_id = $1", [customer.id]);
    expect(rows[0]).toEqual({ name: "Cliente" });
  });

  test("past orders keep their contact snapshot after a phone change (AC5)", async () => {
    const customer = await insertCustomerAccount(database, auth);
    await placeTestOrder(database, { overrides: { "contact.email": customer.email, "contact.phone": "5700 1111" } });

    await save({ name: "Cliente", phone: "5799 9999", locale: "en" }, { cookie: session(customer.id) });

    const { rows } = await database.client.query("select contact_phone from orders where lower(contact_email) = $1", [customer.email]);
    expect(rows).toEqual([{ contact_phone: "+23057001111" }]);
  });
});
