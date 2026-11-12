// S-036: My profile (`admin/profile` updateProfile, changePassword, setAlerts).
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { signedInAdmin } from "~/server/testing/admin-session";
import { TEST_PASSWORD, insertAdmin } from "~/server/testing/admins";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./profile";

let database: TestDatabase;
let session: Awaited<ReturnType<typeof signedInAdmin>>;

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  session = await signedInAdmin(database, { role: "admin", name: "Sarah", locale: "en" });
}, 60_000);

afterAll(async () => {
  await database.close();
});


type Envelope = { data: { ok: false; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };

function post(form: Record<string, string | string[]>, options: Partial<RouteArgsOptions> = {}) {
  return action(routeArgs(database, { path: "/admin/profile", auth: session.auth, cookie: session.cookie, form, ...options }) as never) as Promise<unknown>;
}

async function load(cookie = session.cookie) {
  return (await loader(routeArgs(database, { path: "/admin/profile", auth: session.auth, cookie }) as never)) as Record<string, unknown>;
}

async function row(id = session.admin.id) {
  const result = await database.client.query<{ name: string; locale: string; alert_push: boolean; alert_email: boolean }>(
    "select name, locale, alert_push, alert_email from admin where id = $1",
    [id],
  );
  return result.rows[0]!;
}

describe("name and language (AC1)", () => {
  test("saving a name and French stores them; the admin UI is French from the next load", async () => {
    expect(await post({ intent: "updateProfile", name: "  Sarah B.  ", locale: "fr" })).toEqual({ ok: true, intent: "updateProfile" });

    expect(await row()).toMatchObject({ name: "Sarah B.", locale: "fr" });
    expect((await load()).title).toBe("Mon profil");
  });
});

describe("name rules (AC2)", () => {
  test.each(["", "   ", "x".repeat(81)])("name %j is VALIDATION_FAILED on name and nothing changes", async (name) => {
    const result = (await post({ intent: "updateProfile", name, locale: "fr" })) as Envelope;

    expect(result.init.status).toBe(400);
    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(Object.keys(result.data.error.fields ?? {})).toEqual(["name"]);
    expect(await row()).toMatchObject({ name: "Sarah", locale: "en" });
  });

  test("80 characters is fine", async () => {
    expect(await post({ intent: "updateProfile", name: "x".repeat(80), locale: "en" })).toMatchObject({ ok: true });
  });
});

describe("password (AC3)", () => {
  test("a 10-character password is changed and this session stays signed in", async () => {
    const result = await post({ intent: "changePassword", currentPassword: TEST_PASSWORD, password: "0123456789" });

    expect(result).toEqual({ ok: true, intent: "changePassword" });
    expect(session.auth.passwordOf(session.admin.email)).toBe("0123456789");
    expect(session.auth.signOuts).toEqual([]);
    expect((await load()).name).toBe("Sarah");
  });

  test("9 characters is VALIDATION_FAILED on password", async () => {
    const result = (await post({ intent: "changePassword", currentPassword: TEST_PASSWORD, password: "012345678" })) as Envelope;

    expect(result.data.error.code).toBe("VALIDATION_FAILED");
    expect(result.data.error.fields).toEqual({ password: "At least 10 characters" });
    expect(session.auth.passwordOf(session.admin.email)).toBe(TEST_PASSWORD);
  });

  test("a wrong current password changes nothing, and RL-auth stops guessing after 5 tries", async () => {
    const wrong = (await post({ intent: "changePassword", currentPassword: "not it", password: "0123456789" })) as Envelope;
    expect(wrong.data.error.fields).toEqual({ currentPassword: "Your current password is not right." });

    for (let i = 0; i < 4; i++) await post({ intent: "changePassword", currentPassword: "not it", password: "0123456789" });
    const limited = (await post({ intent: "changePassword", currentPassword: TEST_PASSWORD, password: "0123456789" })) as Envelope;

    expect(limited.init.status).toBe(429);
    expect(session.auth.passwordOf(session.admin.email)).toBe(TEST_PASSWORD);
  });
});

describe("alert switches (AC4)", () => {
  test("both are on by default; turning push off is stored and shows after reload", async () => {
    expect(await load()).toMatchObject({ alertPush: true, alertEmail: true });

    expect(await post({ intent: "setAlerts", alertEmail: "on" })).toEqual({ ok: true, intent: "setAlerts" });

    expect(await row()).toMatchObject({ alert_push: false, alert_email: true });
    expect(await load()).toMatchObject({ alertPush: false, alertEmail: true });
  });

  test("turning email off and push back on", async () => {
    await post({ intent: "setAlerts", alertPush: "on" });

    expect(await row()).toMatchObject({ alert_push: true, alert_email: false });
  });
});

describe("own data only (AC5)", () => {
  test("an id in the form never edits another admin", async () => {
    const other = await insertAdmin(database, session.auth, { name: "Owner" });

    await post({ intent: "updateProfile", id: other.id, adminId: other.id, name: "Hacked", locale: "fr" });
    await post({ intent: "setAlerts", id: other.id });

    expect(await row(other.id)).toMatchObject({ name: "Owner", locale: "en", alert_push: true, alert_email: true });
    expect(await row()).toMatchObject({ name: "Hacked" });
  });

  test("the loader returns the signed-in admin's own row only", async () => {
    await insertAdmin(database, session.auth, { name: "Owner" });

    const loaded = await load();

    expect(loaded).toMatchObject({ name: "Sarah", email: session.admin.email });
    expect(JSON.stringify(loaded)).not.toContain("Owner");
  });
});

describe("push devices (AC6)", () => {
  test("shows 0 devices and still saves the push switch", async () => {
    expect((await load()).pushDevices).toBe(0);

    await post({ intent: "setAlerts", alertPush: "on", alertEmail: "on" });

    expect(await load()).toMatchObject({ alertPush: true, pushDevices: 0 });
  });
});

test("an unknown intent is refused without changes", async () => {
  const result = (await post({ intent: "deleteEverything" })) as Envelope;

  expect(result.init.status).toBe(400);
});
