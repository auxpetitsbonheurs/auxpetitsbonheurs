// Admin session rules (S-009): sign-in, the 30-day age measured from the amr sign-in
// time with a fixed clock, and the relative-only `next`.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { requireAdmin, safeNext, signInAdmin } from "./auth.server";
import { TEST_PASSWORD, insertAdmin, insertCustomerAccount } from "./testing/admins";
import { FakeAuth } from "./testing/fake-auth";
import { routeArgs } from "./testing/route-context";

let database: TestDatabase;
let auth: FakeAuth;

beforeEach(async () => {
  database = await createTestDatabase();
  auth = new FakeAuth();
}, 60_000);

afterEach(async () => {
  await database.close();
});

const NOW = "2026-11-10T08:00:00Z";
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.parse(NOW) - ms);

async function thrownBy(run: () => Promise<unknown>): Promise<Response> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Response) return error;
    throw error;
  }
  throw new Error("expected a redirect");
}

describe("signInAdmin (S-009 AC1)", () => {
  test("valid credentials of an active admin sign in, set the session cookie and record the sign-in time", async () => {
    const admin = await insertAdmin(database, auth, { name: "Sarah" });
    const args = routeArgs(database, { path: "/admin/login", auth, now: NOW, form: {} });

    const result = await signInAdmin(args, { email: admin.email, password: TEST_PASSWORD });

    expect(result).toMatchObject({ ok: true, admin: { id: admin.id, name: "Sarah", role: "owner" } });
    const { rows } = await database.client.query<{ last_sign_in_at: Date }>("select last_sign_in_at from admin where id = $1", [admin.id]);
    expect(rows[0]!.last_sign_in_at.toISOString()).toBe(new Date(NOW).toISOString());
  });

  test.each([
    ["a wrong password", "wrong"],
    ["an unknown email", "unknown"],
    ["a deactivated admin", "inactive"],
    ["a customer-only account", "customer"],
  ])("%s is refused and leaves no session", async (_label, kind) => {
    const admin = await insertAdmin(database, auth, { active: kind !== "inactive" });
    const customer = await insertCustomerAccount(database, auth);
    const email = kind === "unknown" ? "nobody@example.com" : kind === "customer" ? customer.email : admin.email;
    const password = kind === "wrong" ? "not the password" : TEST_PASSWORD;
    const args = routeArgs(database, { path: "/admin/login", auth, now: NOW, form: {} });

    expect(await signInAdmin(args, { email, password })).toEqual({ ok: false });
    expect(await args.context.get((await import("./auth-gateway.server")).authContext).claims()).toBeNull();
  });
});

describe("30-day session (S-009 AC3)", () => {
  test("a session created 29 days ago loads", async () => {
    const admin = await insertAdmin(database, auth);
    const cookie = auth.sessionCookie(admin.id, ago(29 * DAY));

    const me = await requireAdmin(routeArgs(database, { path: "/admin", auth, cookie, now: NOW }));

    expect(me.id).toBe(admin.id);
  });

  test("exactly 30 days still loads", async () => {
    const admin = await insertAdmin(database, auth);

    const me = await requireAdmin(routeArgs(database, { path: "/admin", auth, cookie: auth.sessionCookie(admin.id, ago(30 * DAY)), now: NOW }));

    expect(me.id).toBe(admin.id);
  });

  test("30 days and 1 minute redirects to /admin/login?next=/admin and signs the device out", async () => {
    const admin = await insertAdmin(database, auth);
    const cookie = auth.sessionCookie(admin.id, ago(30 * DAY + 60_000));

    const response = await thrownBy(() => requireAdmin(routeArgs(database, { path: "/admin", auth, cookie, now: NOW })));

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin");
    expect(auth.signOuts).toEqual([admin.id]);
    expect(response.headers.get("Set-Cookie")).toMatch(/Max-Age=0/);
  });

  test("a customer session is redirected but left intact (never signed out or upgraded)", async () => {
    const customer = await insertCustomerAccount(database, auth);

    const response = await thrownBy(() =>
      requireAdmin(routeArgs(database, { path: "/admin/orders?tab=review", auth, cookie: auth.sessionCookie(customer.id, ago(DAY)), now: NOW })),
    );

    expect(response.headers.get("Location")).toBe("/admin/login?next=%2Fadmin%2Forders%3Ftab%3Dreview");
    expect(auth.signOuts).toEqual([]);
  });

  test("a deactivated admin is signed out at the next request", async () => {
    const admin = await insertAdmin(database, auth, { active: false });

    const response = await thrownBy(() => requireAdmin(routeArgs(database, { path: "/admin", auth, cookie: auth.sessionCookie(admin.id, ago(DAY)), now: NOW })));

    expect(response.status).toBe(302);
    expect(auth.signOuts).toEqual([admin.id]);
  });
});

describe("Owner-only guard (S-022)", () => {
  async function ownerCheck(cookie: string): Promise<number> {
    try {
      await requireAdmin(routeArgs(database, { path: "/admin/team", auth, cookie, now: NOW }), { role: "owner" });
      return 200;
    } catch (error) {
      return (error as { init: { status: number } }).init.status;
    }
  }

  test("AC5: a role change applies to the very next request of the old session, both ways", async () => {
    const admin = await insertAdmin(database, auth, { role: "admin" });
    const cookie = auth.sessionCookie(admin.id, ago(DAY));
    expect(await ownerCheck(cookie)).toBe(403);

    await database.client.query("update admin set role = 'owner' where id = $1", [admin.id]);
    expect(await ownerCheck(cookie)).toBe(200);

    await database.client.query("update admin set role = 'admin' where id = $1", [admin.id]);
    expect(await ownerCheck(cookie)).toBe(403);
  });

  test("an Owner-only refusal never signs the Admin out", async () => {
    const admin = await insertAdmin(database, auth, { role: "admin" });

    expect(await ownerCheck(auth.sessionCookie(admin.id, ago(DAY)))).toBe(403);
    expect(auth.signOuts).toEqual([]);
  });
});

describe("safeNext (S-009 AC6)", () => {
  test.each([
    ["/admin/orders?tab=review", "/admin/orders?tab=review"],
    ["/admin", "/admin"],
    ["https://evil.example", "/admin"],
    ["//evil.example", "/admin"],
    ["/\\evil.example", "/admin"],
    ["\\\\evil.example", "/admin"],
    ["/admin\\..\\..", "/admin"],
    ["javascript:alert(1)", "/admin"],
    ["/basket", "/admin"],
    ["/administrator", "/admin"],
    ["/admin/%0d%0aSet-Cookie:x", "/admin"],
    ["", "/admin"],
    [null, "/admin"],
    [undefined, "/admin"],
  ])("%s -> %s", (next, expected) => {
    expect(safeNext(next)).toBe(expected);
  });
});
