// S-027 Team list, S-028 invite (field rules, EMAIL_IN_USE, emailQueued) and S-030
// resend / revoke through the `admin/team` loader and action.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import { emailContext } from "~/server/email/context.server";
import type { Mailer } from "~/server/email/sender.server";
import { signedInAdmin } from "~/server/testing/admin-session";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { type RouteArgsOptions, routeArgs } from "~/server/testing/route-context";
import { action, loader } from "./team";

let database: TestDatabase;
let owner: Awaited<ReturnType<typeof signedInAdmin>>;

const NOW = "2026-11-12T06:00:00Z";

beforeAll(async () => {
  database = await createTestDatabase();
}, 60_000);

beforeEach(async () => {
  await database.client.exec("delete from email_outbox; delete from admin_invitation; delete from admin; delete from customer; delete from auth.users;");
  owner = await signedInAdmin(database, { role: "owner", name: "Sarah", locale: "en" });
}, 60_000);

afterAll(async () => {
  await database.close();
});

type Envelope = { data: { ok: false; intent?: string; error: { code: string; message: string; fields?: Record<string, string> } }; init: { status: number } };
type TeamPage = Awaited<ReturnType<typeof loader>>;

function args(options: Partial<RouteArgsOptions> & { mailer?: Mailer | null } = {}) {
  const built = routeArgs(database, { path: "/admin/team", auth: owner.auth, cookie: owner.cookie, now: NOW, ...options });
  built.context.set(emailContext, { mailer: options.mailer ?? null, hookSecret: null, timeoutMs: 50 });
  return built;
}

const load = (options: Partial<RouteArgsOptions> & { mailer?: Mailer | null } = {}) => loader(args(options) as never) as Promise<TeamPage>;

async function post(form: Record<string, string>, options: Partial<RouteArgsOptions> & { mailer?: Mailer | null } = {}) {
  const built = args({ ...options, form });
  const result = await action(built as never);
  await built.afterResponse.settled();
  return result as unknown;
}

const invite = (form: Partial<Record<string, string>> = {}, options: { mailer?: Mailer | null } = {}) =>
  post({ intent: "invite", name: "Anna", email: "anna@example.com", role: "admin", locale: "fr", ...form } as Record<string, string>, options);

const countInvitations = async () => (await database.client.query<{ n: number }>("select count(*)::int as n from admin_invitation")).rows[0]!.n;

describe("Team list (S-027)", () => {
  test("AC1: admins with role, Active/Deactivated and last sign-in in Mauritius time; invitations with expiry", async () => {
    const helper = await insertAdmin(database, new FakeAuth(), { name: "Bea", role: "admin", active: false });
    await database.client.query("update admin set last_sign_in_at = '2026-11-10T10:05:00Z' where id = $1", [helper.id]);
    await invite();

    const page = await load();

    expect(page.title).toBe("Team");
    expect(page.meId).toBe(owner.admin.id);
    expect(page.admins).toEqual([
      { id: owner.admin.id, name: "Sarah", email: owner.admin.email, role: "owner", active: true, lastSignIn: null },
      { id: helper.id, name: "Bea", email: helper.email, role: "admin", active: false, lastSignIn: "Tue 10 Nov 14:05" },
    ]);
    expect(page.invites).toEqual([{ id: expect.any(String), name: "Anna", email: "anna@example.com", role: "admin", validUntil: "Thu 19 Nov", emailNotSent: true }]);
  });

  test("AC2: alone, the Owner sees only their own row and no invitations", async () => {
    const page = await load();

    expect(page.admins.map((a) => a.id)).toEqual([owner.admin.id]);
    expect(page.invites).toEqual([]);
  });

  test("AC4: expired, revoked and accepted invitations are not pending", async () => {
    await invite({ email: "expired@example.com" });
    await invite({ email: "revoked@example.com" });
    await invite({ email: "accepted@example.com" });
    await database.client.query("update admin_invitation set expires_at = '2026-11-12T05:59:00Z' where email = 'expired@example.com'");
    await database.client.query("update admin_invitation set revoked_at = now() where email = 'revoked@example.com'");
    await database.client.query("update admin_invitation set accepted_at = now() where email = 'accepted@example.com'");

    expect((await load()).invites).toEqual([]);
  });

  test("AC9: in French, the dates are French", async () => {
    const french = await signedInAdmin(database, { role: "owner", name: "Julie", locale: "fr" });
    await database.client.query("update admin set last_sign_in_at = '2026-11-10T10:05:00Z' where id = $1", [french.admin.id]);
    await invite();

    const page = await load({ auth: french.auth, cookie: french.cookie });

    expect(page.title).toBe("Équipe");
    expect(page.admins.find((a) => a.id === french.admin.id)?.lastSignIn).toBe("mar. 10 nov. 14:05");
    expect(page.invites[0]!.validUntil).toBe("jeu. 19 nov.");
  });

  test("a sent invitation email is not flagged", async () => {
    const mailer: Mailer = { send: async () => ({ id: "re-1" }) };
    await invite({}, { mailer });

    expect((await load({ mailer })).invites[0]!.emailNotSent).toBe(false);
  });
});

describe("invite (S-028)", () => {
  test("AC1: answers ok with emailQueued and the address for the toast; the email goes after the response", async () => {
    const sent: string[] = [];

    const result = await invite({ email: " Anna@Example.com " }, { mailer: { send: async (m) => (sent.push(m.to), { id: "re-1" }) } });

    expect(result).toEqual({ ok: true, intent: "invite", email: "anna@example.com", emailQueued: true });
    expect(sent).toEqual(["anna@example.com"]);
  });

  test("AC3: without a working sender the invitation stays and emailQueued is false", async () => {
    expect(await invite()).toEqual({ ok: true, intent: "invite", email: "anna@example.com", emailQueued: false });
    expect(await countInvitations()).toBe(1);
  });

  test("AC3: a provider failure keeps the invitation; Team shows Email not sent", async () => {
    await invite({}, { mailer: { send: async () => Promise.reject(new Error("down")) } });

    expect((await load()).invites[0]!.emailNotSent).toBe(true);
  });

  test.each([
    [{ name: "  " }, "name", "Enter their name (80 characters or fewer)."],
    [{ email: "not-an-email" }, "email", "Enter an email address, for example name@example.com."],
    [{ role: "superuser" }, "role", "Choose Admin or Owner."],
    [{ locale: "de" }, "locale", "Choose English or Français."],
  ])("AC5: %j is VALIDATION_FAILED on its own field, nothing created", async (form, field, message) => {
    const result = (await invite(form)) as Envelope;

    expect(result.init.status).toBe(400);
    expect(result.data).toMatchObject({ intent: "invite", error: { code: "VALIDATION_FAILED", fields: { [field]: message } } });
    expect(Object.keys(result.data.error.fields ?? {})).toEqual([field]);
    expect(await countInvitations()).toBe(0);
  });

  test("AC4: an existing admin's email is EMAIL_IN_USE on the email field", async () => {
    await insertAdmin(database, new FakeAuth(), { email: "anna@example.com", role: "admin" });

    const result = (await invite()) as Envelope;

    expect(result.init.status).toBe(409);
    expect(result.data.error).toMatchObject({ code: "EMAIL_IN_USE", fields: { email: "This email already has an account." } });
  });

  test("AC4: a deactivated admin's email says to use Reactivate", async () => {
    await insertAdmin(database, new FakeAuth(), { email: "anna@example.com", role: "admin", active: false });

    const result = (await invite()) as Envelope;

    expect(result.data.error.fields).toEqual({ email: "This email already has an account. Use Reactivate instead." });
    expect(await countInvitations()).toBe(0);
  });
});

describe("resend and revoke (S-030)", () => {
  const openInvite = async () => (await load()).invites[0]!;

  test("AC1: resend answers ok and the list shows one fresh invitation", async () => {
    await invite();
    const before = await openInvite();

    const result = await post({ intent: "resendInvite", id: before.id });

    expect(result).toEqual({ ok: true, intent: "resendInvite", email: "anna@example.com", emailQueued: false });
    const after = (await load()).invites;
    expect(after).toHaveLength(1);
    expect(after[0]!.id).not.toBe(before.id);
  });

  test("AC2: revoke answers ok and the invitation leaves the list", async () => {
    await invite();

    expect(await post({ intent: "revokeInvite", id: (await openInvite()).id })).toEqual({ ok: true, intent: "revokeInvite", email: "anna@example.com" });
    expect((await load()).invites).toEqual([]);
  });

  test("AC3: a revoked invitation is INVITE_INVALID (410); an unknown one NOT_FOUND; a malformed id VALIDATION_FAILED", async () => {
    await invite();
    const { id } = await openInvite();
    await post({ intent: "revokeInvite", id });

    expect(((await post({ intent: "resendInvite", id })) as Envelope).init.status).toBe(410);
    expect(((await post({ intent: "revokeInvite", id: "00000000-0000-4000-8000-000000000000" })) as Envelope).data.error.code).toBe("NOT_FOUND");
    expect(((await post({ intent: "revokeInvite", id: "nope" })) as Envelope).data.error.code).toBe("VALIDATION_FAILED");
    expect(await countInvitations()).toBe(1);
  });

  test("an unknown intent is refused", async () => {
    expect(((await post({ intent: "makeMeOwner" })) as Envelope).data.error.code).toBe("VALIDATION_FAILED");
  });
});
