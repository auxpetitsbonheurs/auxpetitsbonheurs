// `admin/login` and `admin/sign-out` (S-009 AC2, AC5, AC7, AC12).
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { TEST_PASSWORD, insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./login";
import { action as signOutAction } from "./sign-out";

let database: TestDatabase;
let auth: FakeAuth;

beforeEach(async () => {
  database = await createTestDatabase();
  auth = new FakeAuth();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Refusal = {
  data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> }; values?: Record<string, string> };
  init: { status: number };
};

const GENERIC = "Email or password is not right. Try again or reset your password.";

function post(form: Record<string, string>, options: Partial<RouteArgsOptions> = {}) {
  return action(routeArgs(database, { path: "/admin/login", auth, form, ...options }) as never) as Promise<unknown>;
}

describe("sign in (S-009 AC1)", () => {
  test("valid credentials redirect to next with the session cookie", async () => {
    const admin = await insertAdmin(database, auth);

    const response = (await post({ email: admin.email, password: TEST_PASSWORD, next: "/admin/orders?tab=review" })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/orders?tab=review");
    expect(response.headers.get("Set-Cookie")).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  });

  test("without next, and with an unsafe next (AC6), it lands on /admin", async () => {
    const admin = await insertAdmin(database, auth);

    for (const next of [undefined, "https://evil.example", "//evil.example"]) {
      const form: Record<string, string> = { email: admin.email.toUpperCase(), password: TEST_PASSWORD };
      if (next) form.next = next;
      expect(((await post(form)) as Response).headers.get("Location")).toBe("/admin");
    }
  });
});

describe("one generic refusal (S-009 AC2)", () => {
  test("wrong password, unknown email, deactivated admin and customer-only account get the same message and status", async () => {
    const admin = await insertAdmin(database, auth);
    const inactive = await insertAdmin(database, auth, { active: false });
    const customer = await insertCustomerAccount(database, auth);

    const refusals = (await Promise.all([
      post({ email: admin.email, password: "not the password" }),
      post({ email: "nobody@example.com", password: TEST_PASSWORD }),
      post({ email: inactive.email, password: TEST_PASSWORD }),
      post({ email: customer.email, password: TEST_PASSWORD }),
    ])) as Refusal[];

    for (const refusal of refusals) {
      expect(refusal).not.toBeInstanceOf(Response);
      expect(refusal.init.status).toBe(401);
      expect(refusal.data.error).toEqual({ code: "INVALID_CREDENTIALS", message: GENERIC });
      expect(JSON.stringify(refusal.data)).not.toContain(TEST_PASSWORD);
    }
    expect(new Set(refusals.map((r) => JSON.stringify({ ...r.data, values: undefined }))).size).toBe(1);
  });
});

describe("field errors (S-009 AC5)", () => {
  test.each([
    ["an empty email", { email: "", password: "x" }, { email: "Enter your email address." }],
    ["an invalid email", { email: "sarah@", password: "x" }, { email: "Enter an email address, for example name@example.com." }],
    ["an empty password", { email: "sarah@example.com", password: "" }, { password: "Enter your password." }],
    ["both empty", { email: " ", password: "" }, { email: "Enter your email address.", password: "Enter your password." }],
  ])("%s names each field and makes no sign-in attempt", async (_label, form, fields) => {
    const refusal = (await post(form)) as Refusal;

    expect(refusal.init.status).toBe(400);
    expect(refusal.data.error.code).toBe("VALIDATION_FAILED");
    expect(refusal.data.error.fields).toEqual(fields);
    expect(refusal.data.values).toEqual({ email: form.email.trim() });
    expect(auth.attempts).toEqual([]);
  });
});

describe("RL-auth on sign-in (S-023)", () => {
  const ip = { "cf-connecting-ip": "203.0.113.7" };
  const attempt = (email: string, password: string, headers = ip) => post({ email, password }, { headers });

  test("AC1: the fifth attempt is still checked; the sixth is RATE_LIMITED 429 with Retry-After, keeping the email", async () => {
    const admin = await insertAdmin(database, auth);
    for (let i = 0; i < 4; i += 1) await attempt(admin.email, "wrong");

    const fifth = (await attempt(admin.email, "wrong")) as Refusal;
    const sixth = (await attempt(admin.email, TEST_PASSWORD)) as Refusal & { init: { headers: Record<string, string> } };

    expect(fifth.data.error.code).toBe("INVALID_CREDENTIALS");
    expect(sixth.init.status).toBe(429);
    expect(new Headers(sixth.init.headers).get("Retry-After")).toBe(String(15 * 60));
    expect(sixth.data.error).toEqual({ code: "RATE_LIMITED", message: "Too many attempts, wait a few minutes." });
    expect(sixth.data).toMatchObject({ values: { email: admin.email }, retryAfterMinutes: 15 });
    expect(auth.attempts).toHaveLength(5);
  });

  test("AC3: another email from the same IP, or the same email from another IP, is not limited", async () => {
    const admin = await insertAdmin(database, auth);
    for (let i = 0; i < 6; i += 1) await attempt(admin.email, "wrong");

    expect(((await attempt("other@example.com", "wrong")) as Refusal).data.error.code).toBe("INVALID_CREDENTIALS");
    expect(((await attempt(admin.email, TEST_PASSWORD, { "cf-connecting-ip": "198.51.100.1" })) as Response).status).toBe(302);
  });

  test("AC6: known and unknown emails get the same limited answer", async () => {
    const admin = await insertAdmin(database, auth);
    for (let i = 0; i < 5; i += 1) {
      await attempt(admin.email, "wrong");
      await attempt("nobody@example.com", "wrong");
    }

    const known = (await attempt(admin.email, "wrong")) as Refusal;
    const unknown = (await attempt("nobody@example.com", "wrong")) as Refusal;

    expect({ ...known.data, values: undefined }).toEqual({ ...unknown.data, values: undefined });
    expect(known.init.status).toBe(unknown.init.status);
  });

  test("a successful sign-in starts the count again", async () => {
    const admin = await insertAdmin(database, auth);
    for (let i = 0; i < 4; i += 1) await attempt(admin.email, "wrong");
    expect(((await attempt(admin.email, TEST_PASSWORD)) as Response).status).toBe(302);

    for (let i = 0; i < 4; i += 1) await attempt(admin.email, "wrong");
    expect(((await attempt(admin.email, "wrong")) as Refusal).data.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("field problems are not counted (no sign-in attempt is made)", async () => {
    for (let i = 0; i < 6; i += 1) await post({ email: "sarah@", password: "x" }, { headers: ip });

    expect(((await attempt("sarah@example.com", "wrong")) as Refusal).data.error.code).toBe("INVALID_CREDENTIALS");
  });

  test("the limited message is French for a French visitor", async () => {
    for (let i = 0; i < 5; i += 1) await post({ email: "a@example.com", password: "x" }, { headers: ip, cookie: "apb_locale=fr" });

    const limited = (await post({ email: "a@example.com", password: "x" }, { headers: ip, cookie: "apb_locale=fr" })) as Refusal;
    expect(limited.data.error.message).toBe("Trop de tentatives, patientez quelques minutes.");
  });
});

describe("French (S-009 AC12)", () => {
  test("labels come from the French catalogue and errors are French", async () => {
    const options = { cookie: "apb_locale=fr" };
    const admin = await insertAdmin(database, auth);

    const empty = (await post({ email: "", password: "" }, options)) as Refusal;
    const wrong = (await post({ email: admin.email, password: "nope" }, options)) as Refusal;
    const page = await loader(routeArgs(database, { path: "/admin/login", auth, ...options }) as never);

    expect(empty.data.error.fields).toEqual({ email: "Saisissez votre adresse e-mail.", password: "Saisissez votre mot de passe." });
    expect(wrong.data.error.message).toBe("L'e-mail ou le mot de passe n'est pas correct. Réessayez ou réinitialisez votre mot de passe.");
    expect(page).toMatchObject({ title: "Connexion" });
  });
});

describe("login page loader", () => {
  test("keeps only a safe next", async () => {
    expect(await loader(routeArgs(database, { path: "/admin/login?next=%2Fadmin%2Forders", auth }) as never)).toMatchObject({ next: "/admin/orders" });
    expect(await loader(routeArgs(database, { path: "/admin/login?next=%2F%2Fevil.example", auth }) as never)).toMatchObject({ next: "/admin" });
  });

  test("an admin who is already signed in goes straight to next", async () => {
    const admin = await insertAdmin(database, auth);
    const cookie = auth.sessionCookie(admin.id, new Date("2026-11-09T00:00:00Z"));

    let thrown: unknown;
    try {
      await loader(routeArgs(database, { path: "/admin/login?next=%2Fadmin%2Forders", auth, cookie }) as never);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as Response).headers.get("Location")).toBe("/admin/orders");
  });
});

describe("sign out (S-009 AC7)", () => {
  test("POST /admin/sign-out ends the session, clears the cookie and lands on /admin/login", async () => {
    const admin = await insertAdmin(database, auth);
    const cookie = auth.sessionCookie(admin.id, new Date("2026-11-09T00:00:00Z"));

    const response = (await signOutAction(routeArgs(database, { path: "/admin/sign-out", auth, cookie, form: {} }) as never)) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login");
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
    expect(auth.signOuts).toEqual([admin.id]);
  });

  test("a customer posting sign-out keeps their customer session", async () => {
    const customer = await insertCustomerAccount(database, auth);
    const cookie = auth.sessionCookie(customer.id, new Date("2026-11-09T00:00:00Z"));

    const response = (await signOutAction(routeArgs(database, { path: "/admin/sign-out", auth, cookie, form: {} }) as never)) as Response;

    expect(response.headers.get("Location")).toBe("/admin/login");
    expect(auth.signOuts).toEqual([]);
  });

  test("a cross-site sign-out is refused with 403", async () => {
    const admin = await insertAdmin(database, auth);
    const cookie = auth.sessionCookie(admin.id, new Date("2026-11-09T00:00:00Z"));

    let thrown: unknown;
    try {
      await signOutAction(routeArgs(database, { path: "/admin/sign-out", auth, cookie, form: {}, origin: "https://evil.example" }) as never);
    } catch (error) {
      thrown = error;
    }
    expect((thrown as { init: { status: number } }).init.status).toBe(403);
    expect(auth.signOuts).toEqual([]);
  });
});
