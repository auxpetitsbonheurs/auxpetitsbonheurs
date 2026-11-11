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
