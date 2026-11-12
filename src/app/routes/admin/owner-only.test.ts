// S-022 (FR-041): Availability, Settings and Team are Owner-only on the server. An Admin
// gets 403 with no Owner data on the page and FORBIDDEN on any action; an Owner loads them.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { routeArgs } from "~/server/testing/route-context";
import * as availability from "./availability";
import * as settings from "./settings";
import * as team from "./team";

let database: TestDatabase;

beforeEach(async () => {
  database = await createTestDatabase();
}, 60_000);

afterEach(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; error: { code: string; message: string } }; init: { status: number } };

const PAGES = [
  ["/admin/team", team, "invite"],
  ["/admin/settings", settings, "save"],
  ["/admin/availability", availability, "saveRules"],
] as const;

async function refusal(run: () => unknown): Promise<Envelope> {
  try {
    const result = await run();
    throw new Error(`expected a refusal, got ${JSON.stringify(result)}`);
  } catch (error) {
    if (error instanceof Error) throw error;
    return error as Envelope;
  }
}

// S-028 AC6, S-030 AC4: every Team intent refuses an Admin before reading the form.
test.each(["invite", "resendInvite", "revokeInvite", "changeRole", "deactivate", "reactivate"])("an Admin posting %s to /admin/team gets FORBIDDEN and nothing changes (S-031 AC7, S-032 AC9)", async (intent) => {
  const owner = await signedInAdmin(database, { role: "owner" });
  await database.client.query(
    "insert into admin_invitation (email, name, role, token_hash, invited_by, expires_at) values ('open@example.com', 'Open', 'admin', 'hash-1', $1, now() + interval '7 days')",
    [owner.admin.id],
  );
  const { id } = (await database.client.query<{ id: string }>("select id from admin_invitation")).rows[0]!;
  const session = await signedInAdmin(database, { role: "admin" });
  const form = { intent, id, adminId: owner.admin.id, name: "Helper", email: "helper@example.com", role: "admin", locale: "en" };

  const refused = await refusal(() => team.action(routeArgs(database, { path: "/admin/team", auth: session.auth, cookie: session.cookie, form }) as never));

  expect(refused.init.status).toBe(403);
  expect(refused.data.error.code).toBe("FORBIDDEN");
  expect((await database.client.query("select email, revoked_at from admin_invitation")).rows).toEqual([{ email: "open@example.com", revoked_at: null }]);
  expect((await database.client.query("select role, active from admin where id = $1", [owner.admin.id])).rows).toEqual([{ role: "owner", active: true }]);
});

// S-056 AC8, S-057 AC7, S-058 AC8, S-059 AC8: every Availability and Settings intent refuses an
// Admin before reading the form, and nothing changes.
test.each([
  ["/admin/availability", availability, "addBlock"],
  ["/admin/availability", availability, "removeBlock"],
  ["/admin/availability", availability, "saveRules"],
  ["/admin/settings", settings, "save"],
] as const)("an Admin posting to %s %s gets FORBIDDEN and nothing changes", async (path, module, intent) => {
  await database.client.query("insert into blocked_date (starts_on, ends_on) values ('2026-12-24', '2026-12-26')");
  const { id } = (await database.client.query<{ id: string }>("select id from blocked_date")).rows[0]!;
  const session = await signedInAdmin(database, { role: "admin" });
  const form = { intent, id, startsOn: "2026-12-01", endsOn: "2026-12-02", version: "1", deliveryFeeRs: "999", defaultNoticeDays: "9" };

  const refused = await refusal(() => module.action(routeArgs(database, { path, auth: session.auth, cookie: session.cookie, form }) as never));

  expect(refused.init.status).toBe(403);
  expect(refused.data.error.code).toBe("FORBIDDEN");
  expect((await database.client.query("select count(*)::int as n from blocked_date")).rows).toEqual([{ n: 1 }]);
  expect((await database.client.query("select version, delivery_fee_rs from settings")).rows).toEqual([{ version: 1, delivery_fee_rs: 200 }]);
});

test.each([
  ["/admin/availability", availability, "addBlock"],
  ["/admin/settings", settings, "save"],
] as const)("an anonymous post to %s %s is sent to the login page and nothing changes", async (path, module, intent) => {
  const thrown = await Promise.resolve(module.action(routeArgs(database, { path, form: { intent, startsOn: "2026-12-01", endsOn: "2026-12-02", version: "1" } }) as never)).then(
    () => null,
    (error: unknown) => error,
  );

  expect(thrown).toBeInstanceOf(Response);
  expect((thrown as Response).headers.get("Location")).toMatch(/^\/admin\/login\?next=/);
  expect((await database.client.query("select count(*)::int as n from blocked_date")).rows).toEqual([{ n: 0 }]);
});

describe.each(PAGES)("%s", (path, module, intent) => {
  test("AC1: an Admin gets 403 with the Owner-only state and no Owner data", async () => {
    const session = await signedInAdmin(database, { role: "admin" });

    const refused = await refusal(() => module.loader(routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never));

    expect(refused.init.status).toBe(403);
    expect(refused.data).toEqual({ ok: false, error: { code: "FORBIDDEN", message: "You cannot do this." } });
  });

  test(`AC2: an Admin posting ${intent} directly gets FORBIDDEN 403`, async () => {
    const session = await signedInAdmin(database, { role: "admin" });
    const form = { intent, version: "1", name: "Helper", email: "helper@example.com", role: "owner", locale: "en" };

    const refused = await refusal(() => module.action(routeArgs(database, { path, auth: session.auth, cookie: session.cookie, form }) as never));

    expect(refused.init.status).toBe(403);
    expect(refused.data.error.code).toBe("FORBIDDEN");
    expect((await database.client.query("select count(*)::int as n from admin_invitation")).rows).toEqual([{ n: 0 }]);
  });

  test("AC3: an Owner opens the page", async () => {
    const session = await signedInAdmin(database, { role: "owner" });

    const page = await module.loader(routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never);

    expect(page).toMatchObject({ title: expect.any(String) });
  });

  test("AC7: the refusal is in the Admin's language", async () => {
    const session = await signedInAdmin(database, { role: "admin", locale: "fr" });

    const refused = await refusal(() => module.loader(routeArgs(database, { path, auth: session.auth, cookie: session.cookie }) as never));

    expect(refused.data.error.message).toBe("Vous ne pouvez pas faire cela.");
  });
});
