// S-029: the accept page `/admin/invite/:token` (loader, accept action, page language).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { adminLocaleContext } from "~/server/admin-page.server";
import { type RequestDb, requestDbContext } from "~/server/db.server";
import type { Database } from "~/server/db.server";
import { inviteAdmin } from "~/server/services/invite-admin.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { userAdminContext } from "~/server/user-admin.server";
import { invitationLocale } from "~/server/invite-page.server";
import { action, loader } from "./invite";

let database: TestDatabase;
let auth: FakeAuth;
let users: FakeUserAdmin;
let token: string;

const NOW = "2026-11-12T08:00:00Z";

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.client.exec("delete from email_outbox; delete from admin_invitation; delete from rate_limit_bucket; delete from admin; delete from customer; delete from auth.users;");
  auth = new FakeAuth();
  users = new FakeUserAdmin(database, auth);
  const owner = await insertAdmin(database, new FakeAuth(), { name: "Sarah" });
  const db = database.db as unknown as Database;
  await inviteAdmin(db, { name: "Anna", email: "anna@example.com", role: "admin", locale: "fr" }, { now: new Date(NOW), inviter: { id: owner.id, name: "Sarah" }, origin: "https://shop.test" });
  const payload = (await database.client.query<{ payload: { link: string } }>("select payload from email_outbox")).rows[0]!.payload;
  token = payload.link.split("/admin/invite/")[1]!;
}, 60_000);

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };
type Page = { data?: unknown; init?: { status: number } } & Record<string, unknown>;

function args(path: string, options: Partial<RouteArgsOptions> = {}) {
  const built = routeArgs(database, { path, auth, now: NOW, params: { token: path.split("/").at(-1)! }, ...options });
  built.context.set(userAdminContext, users);
  return built;
}

const load = (t = token) => loader(args(`/admin/invite/${t}`) as never) as Promise<Page>;
const accept = (form: Record<string, string>, t = token) => action(args(`/admin/invite/${t}`, { form }) as never) as Promise<unknown>;

/** A database that fails the test on any use (AC7: no read before the token's shape is checked). */
function untouchable(built: ReturnType<typeof args>) {
  const db = new Proxy({}, { get: () => { throw new Error("the database was read"); } });
  built.context.set(requestDbContext, { db: db as RequestDb["db"], close: async () => {} });
  return built;
}

describe("valid link (AC1)", () => {
  test("shows the name, email and role read-only, in the invitation's language", async () => {
    expect(await load()).toEqual({ invalid: false, title: "Rejoindre l'équipe", name: "Anna", email: "anna@example.com", role: "admin", locale: "fr" });
  });
});

describe("accept", () => {
  test("AC2: a 10-character password creates the admin, signs in and lands on /admin", async () => {
    const response = (await accept({ password: "0123456789", locale: "en" })) as Response;

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/admin");
    const [created] = users.created;
    expect(response.headers.getSetCookie().at(-1)).toMatch(new RegExp(`^apb_fake_session=${created!.id}~`));
    expect((await database.client.query("select role, locale from admin where email = 'anna@example.com'")).rows).toEqual([{ role: "admin", locale: "en" }]);
  });

  test("AC3: a used link answers 410 INVITE_INVALID with the page's message", async () => {
    await accept({ password: "0123456789", locale: "en" });

    const second = (await accept({ password: "0123456789", locale: "en" })) as Envelope;

    expect(second.init.status).toBe(410);
    // A used link no longer names a language: the visitor's own (English here) is used.
    expect(second.data.error).toEqual({ code: "INVITE_INVALID", message: "This invitation has expired or was already used. Ask the owner for a new one." });
    expect(((await load()) as Page).init?.status).toBe(410);
  });

  test("AC4: 9 characters is VALIDATION_FAILED on password and no account is made", async () => {
    const result = (await accept({ password: "012345678", locale: "en" })) as Envelope;

    expect(result.init.status).toBe(400);
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(result.data.error.fields ?? {})).toEqual(["password"]);
    expect(users.created).toEqual([]);
  });

  test("a missing language is a field error too", async () => {
    const result = (await accept({ password: "0123456789", locale: "de" })) as Envelope;

    expect(result.data.error.fields).toHaveProperty("locale");
    expect(users.created).toEqual([]);
  });

  test("AC6: EMAIL_IN_USE when the address became an account", async () => {
    await insertAdmin(database, new FakeAuth(), { email: "anna@example.com", role: "admin" });

    const result = (await accept({ password: "0123456789", locale: "en" })) as Envelope;

    expect(result.init.status).toBe(409);
    expect(result.data.error.code).toBe("EMAIL_IN_USE");
  });

  test("RL-auth: the 6th try within 15 minutes is RATE_LIMITED", async () => {
    for (let i = 0; i < 5; i++) await accept({ password: "short", locale: "en" });
    // Field problems are not counted; failed accepts of a valid shape are.
    for (let i = 0; i < 5; i++) await accept({ password: "0123456789", locale: "en" }, "B".repeat(43));

    const limited = (await accept({ password: "0123456789", locale: "en" }, "B".repeat(43))) as Envelope;

    expect(limited.init.status).toBe(429);
  });
});

describe("token shape (AC7)", () => {
  test.each(["short", "A".repeat(42), `${"A".repeat(42)}!`, "A".repeat(44)])("%j is INVITE_INVALID without a database read", async (bad) => {
    const page = (await loader(untouchable(args(`/admin/invite/${bad}`)) as never)) as Page;
    const posted = (await action(untouchable(args(`/admin/invite/${bad}`, { form: { password: "0123456789", locale: "en" } })) as never)) as Envelope;

    expect(page.init?.status).toBe(410);
    expect(posted.init.status).toBe(410);
    expect(posted.data.error.code).toBe("INVITE_INVALID");
  });
});

describe("page language (AC10)", () => {
  test("the page follows the invitation's language", async () => {
    const built = args(`/admin/invite/${token}`, { headers: { "accept-language": "en" } });

    await invitationLocale(built as never, async () => new Response(null));

    expect(built.context.get(adminLocaleContext)).toBe("fr");
  });

  test("a bad token leaves the visitor's language", async () => {
    const built = args("/admin/invite/short", { headers: { "accept-language": "en" } });

    await invitationLocale(built as never, async () => new Response(null));

    expect(built.context.get(adminLocaleContext)).toBeNull();
  });
});
