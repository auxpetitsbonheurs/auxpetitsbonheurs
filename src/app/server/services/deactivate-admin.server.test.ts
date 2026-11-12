// S-032 deactivate and reactivate: access blocked in the database first, Auth ban second
// (retried safely when it fails), push subscriptions removed, the last Owner protected.
// The concurrent case (AC5) needs two connections: tests/e2e/support/team-race.spec.ts.
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DomainError } from "~/domain/errors";
import { requireAdmin, signInAdmin } from "~/server/auth.server";
import type { Database } from "~/server/db.server";
import { TEST_PASSWORD, insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import { routeArgs } from "~/server/testing/route-context";
import { deactivateAdmin, reactivateAdmin } from "./deactivate-admin.server";

let database: TestDatabase;
let auth: FakeAuth;
let users: FakeUserAdmin;
const db = () => database.db as unknown as Database;
const NOW = new Date("2026-11-12T06:00:00Z");
const PHONE_SIGN_IN = new Date("2026-11-11T08:00:00Z");

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.client.exec("delete from push_subscription; delete from admin_invitation; delete from admin; delete from auth.users;");
  auth = new FakeAuth();
  users = new FakeUserAdmin(database, auth);
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterAll(async () => {
  await database.close();
});

const rowOf = async (id: string) =>
  (await database.client.query<{ role: string; active: boolean; deactivated_at: Date | null; sessions_revoked_at: Date | null }>(
    "select role, active, deactivated_at, sessions_revoked_at from admin where id = $1",
    [id],
  )).rows[0]!;

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

const addPushDevice = (adminId: string, endpoint: string) =>
  database.client.query("insert into push_subscription (admin_id, endpoint, p256dh, auth) values ($1, $2, 'key', 'secret')", [adminId, endpoint]);

async function team() {
  const owner = await insertAdmin(database, auth, { role: "owner", name: "Sarah" });
  const helper = await insertAdmin(database, auth, { role: "admin", name: "Anna" });
  return { owner, helper };
}

describe("deactivate (S-032)", () => {
  test("AC1: active false, deactivated_at set, Auth user banned, push subscriptions deleted (others kept)", async () => {
    const { owner, helper } = await team();
    await addPushDevice(helper.id, "https://push.example/anna");
    await addPushDevice(owner.id, "https://push.example/sarah");

    const outcome = await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });

    expect(outcome).toEqual({ ok: true, name: "Anna", self: false, banned: true });
    expect(await rowOf(helper.id)).toMatchObject({ active: false, deactivated_at: NOW, sessions_revoked_at: NOW, role: "admin" });
    expect(users.banned.has(helper.id)).toBe(true);
    expect((await database.client.query("select endpoint from push_subscription")).rows).toEqual([{ endpoint: "https://push.example/sarah" }]);
  });

  test("AC2: the deactivated admin's phone session is refused on its very next request", async () => {
    const { owner, helper } = await team();
    const cookie = auth.sessionCookie(helper.id, PHONE_SIGN_IN);

    await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });

    await expect(requireAdmin(routeArgs(database, { path: "/admin", auth, cookie, now: NOW.toISOString() }))).rejects.toMatchObject({ status: 302 });
    expect(auth.everywhereSignOuts).toEqual([helper.id]);
  });

  test("AC4: the only active Owner deactivating themselves gets LAST_OWNER and nothing changes", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });

    expect(await codeOf(() => deactivateAdmin(db(), users, { actorId: owner.id, adminId: owner.id, now: NOW }))).toBe("LAST_OWNER");
    expect(await rowOf(owner.id)).toMatchObject({ active: true, deactivated_at: null });
    expect(users.banCalls).toEqual([]);
  });

  test("AC5 (sequential half): after one Owner deactivated the other, the second's attempt gets LAST_OWNER", async () => {
    const a = await insertAdmin(database, auth, { role: "owner" });
    const b = await insertAdmin(database, auth, { role: "owner" });

    await deactivateAdmin(db(), users, { actorId: a.id, adminId: b.id, now: NOW });

    expect(await codeOf(() => deactivateAdmin(db(), users, { actorId: b.id, adminId: a.id, now: NOW }))).toBe("LAST_OWNER");
    expect((await rowOf(a.id)).active).toBe(true);
  });

  test("an Owner may deactivate themselves while another active Owner exists", async () => {
    const me = await insertAdmin(database, auth, { role: "owner" });
    await insertAdmin(database, auth, { role: "owner" });

    expect(await deactivateAdmin(db(), users, { actorId: me.id, adminId: me.id, now: NOW })).toMatchObject({ self: true });
    expect((await rowOf(me.id)).active).toBe(false);
  });

  test("AC8: a failed ban leaves access blocked, answers banned false, and repeating it is safe", async () => {
    const { owner, helper } = await team();
    users.banFails = true;

    const first = await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });
    expect(first).toMatchObject({ ok: true, banned: false });
    expect((await rowOf(helper.id)).active).toBe(false);

    users.banFails = false;
    const later = new Date(NOW.getTime() + 60_000);
    const retried = await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: later });

    expect(retried).toMatchObject({ ok: true, banned: true });
    expect(users.banned.has(helper.id)).toBe(true);
    // The retry changed nothing else: the first deactivation time stands.
    expect(await rowOf(helper.id)).toMatchObject({ active: false, deactivated_at: NOW });
  });

  test("AC9: an unknown adminId is NOT_FOUND", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });

    expect(await codeOf(() => deactivateAdmin(db(), users, { actorId: owner.id, adminId: "00000000-0000-4000-8000-000000000000", now: NOW }))).toBe("NOT_FOUND");
  });

  test("the log line carries no personal data", async () => {
    const { owner, helper } = await team();
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));

    await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });

    expect(lines).toEqual([JSON.stringify({ level: "info", event: "admin_deactivated" })]);
  });
});

describe("reactivate (S-032 AC6)", () => {
  test("the ban is lifted, deactivated_at cleared, role and password unchanged, and old sessions must sign in again", async () => {
    const { owner, helper } = await team();
    await database.client.query("update admin set role = 'owner' where id = $1", [helper.id]);
    const oldCookie = auth.sessionCookie(helper.id, PHONE_SIGN_IN);
    await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });

    const outcome = await reactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });

    expect(outcome).toEqual({ ok: true, name: "Anna" });
    expect(users.banned.has(helper.id)).toBe(false);
    expect(await rowOf(helper.id)).toMatchObject({ active: true, deactivated_at: null, role: "owner" });
    await expect(requireAdmin(routeArgs(database, { path: "/admin", auth, cookie: oldCookie, now: NOW.toISOString() }))).rejects.toMatchObject({ status: 302 });
    const later = new Date(NOW.getTime() + 60_000).toISOString();
    const signedIn = await signInAdmin(routeArgs(database, { path: "/admin/login", auth, now: later, form: {} }), { email: helper.email, password: TEST_PASSWORD });
    expect(signedIn).toMatchObject({ ok: true });
  });

  test("when the ban cannot be lifted nothing changes (AUTH_FAILED) and trying again works", async () => {
    const { owner, helper } = await team();
    await deactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW });
    users.banFails = true;

    expect(await reactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW })).toEqual({ ok: false, code: "AUTH_FAILED", name: "Anna" });
    expect((await rowOf(helper.id)).active).toBe(false);

    users.banFails = false;
    expect(await reactivateAdmin(db(), users, { actorId: owner.id, adminId: helper.id, now: NOW })).toEqual({ ok: true, name: "Anna" });
    expect((await rowOf(helper.id)).active).toBe(true);
  });

  test("AC9: an unknown adminId is NOT_FOUND", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });

    expect(await codeOf(() => reactivateAdmin(db(), users, { actorId: owner.id, adminId: "00000000-0000-4000-8000-000000000000", now: NOW }))).toBe("NOT_FOUND");
  });
});
