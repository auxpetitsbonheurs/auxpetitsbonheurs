// S-031 changeRole: promote, demote, the last-Owner rule (one shared check) and the log line.
// The concurrent case (AC4) needs two connections: tests/e2e/support/team-race.spec.ts.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { DomainError } from "~/domain/errors";
import { requireAdmin } from "~/server/auth.server";
import type { Database } from "~/server/db.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { routeArgs } from "~/server/testing/route-context";
import { changeRole } from "./change-role.server";

let database: TestDatabase;
let auth: FakeAuth;
const db = () => database.db as unknown as Database;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.client.exec("delete from admin_invitation; delete from admin; delete from auth.users;");
  auth = new FakeAuth();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await database.close();
});

const roleOf = async (id: string) => (await database.client.query<{ role: string }>("select role from admin where id = $1", [id])).rows[0]!.role;

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof DomainError) return error.code;
    throw error;
  }
  throw new Error("expected a refusal");
}

describe("changeRole (S-031)", () => {
  test("AC1: an Admin made Owner opens an Owner page on their very next request", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });
    const helper = await insertAdmin(database, auth, { role: "admin", name: "Anna" });
    const cookie = auth.sessionCookie(helper.id, new Date("2026-11-09T08:00:00Z"));

    const outcome = await changeRole(db(), { actorId: owner.id, adminId: helper.id, role: "owner" });

    expect(outcome).toEqual({ ok: true, name: "Anna", from: "admin", to: "owner", self: false });
    const me = await requireAdmin(routeArgs(database, { path: "/admin/team", auth, cookie }), { role: "owner" });
    expect(me.role).toBe("owner");
  });

  test("AC2: with two active Owners, one can be changed to Admin", async () => {
    const first = await insertAdmin(database, auth, { role: "owner" });
    const second = await insertAdmin(database, auth, { role: "owner" });

    await changeRole(db(), { actorId: first.id, adminId: second.id, role: "admin" });

    expect(await roleOf(second.id)).toBe("admin");
  });

  test("AC3: the only active Owner cannot make themselves Admin: LAST_OWNER and the role is unchanged", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });
    // A deactivated Owner does not count.
    await insertAdmin(database, auth, { role: "owner", active: false });

    expect(await codeOf(() => changeRole(db(), { actorId: owner.id, adminId: owner.id, role: "admin" }))).toBe("LAST_OWNER");
    expect(await roleOf(owner.id)).toBe("owner");
  });

  test("AC5: an Owner may change their own role while another active Owner exists", async () => {
    const me = await insertAdmin(database, auth, { role: "owner" });
    await insertAdmin(database, auth, { role: "owner" });

    const outcome = await changeRole(db(), { actorId: me.id, adminId: me.id, role: "admin" });

    expect(outcome).toMatchObject({ self: true, from: "owner", to: "admin" });
    expect(await roleOf(me.id)).toBe("admin");
  });

  test("AC4 (sequential half): after one Owner demoted the other, the second's demotion gets LAST_OWNER", async () => {
    const a = await insertAdmin(database, auth, { role: "owner" });
    const b = await insertAdmin(database, auth, { role: "owner" });

    await changeRole(db(), { actorId: a.id, adminId: b.id, role: "admin" });

    expect(await codeOf(() => changeRole(db(), { actorId: b.id, adminId: a.id, role: "admin" }))).toBe("LAST_OWNER");
    expect([await roleOf(a.id), await roleOf(b.id)]).toEqual(["owner", "admin"]);
  });

  test("an actor who is no longer an active Owner is refused under the lock (FORBIDDEN)", async () => {
    const a = await insertAdmin(database, auth, { role: "owner" });
    await insertAdmin(database, auth, { role: "owner" });
    const helper = await insertAdmin(database, auth, { role: "admin" });
    await database.client.query("update admin set role = 'admin' where id = $1", [a.id]);

    expect(await codeOf(() => changeRole(db(), { actorId: a.id, adminId: helper.id, role: "owner" }))).toBe("FORBIDDEN");
    expect(await roleOf(helper.id)).toBe("admin");
  });

  test("AC6: an unknown adminId is NOT_FOUND", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });

    expect(await codeOf(() => changeRole(db(), { actorId: owner.id, adminId: "00000000-0000-4000-8000-000000000000", role: "admin" }))).toBe("NOT_FOUND");
  });

  test("AC8: the log line says from and to only, no personal data; no line when nothing changed", async () => {
    const owner = await insertAdmin(database, auth, { role: "owner" });
    const helper = await insertAdmin(database, auth, { role: "admin", name: "Anna", email: "anna@example.com" });
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((line: string) => void lines.push(line));

    await changeRole(db(), { actorId: owner.id, adminId: helper.id, role: "owner" });
    await changeRole(db(), { actorId: owner.id, adminId: helper.id, role: "owner" });

    expect(lines).toEqual([JSON.stringify({ level: "info", event: "admin_role_changed", from: "admin", to: "owner" })]);
  });
});
