// S-029: accepting an invitation creates the confirmed Auth user and the admin row with the
// invited role, once; expired, revoked, used and taken addresses create nothing.
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { FakeUserAdmin } from "~/server/testing/fake-user-admin";
import { acceptInvitation } from "./accept-invite.server";
import { inviteAdmin, revokeInvite } from "./invite-admin.server";

let database: TestDatabase;
let db: Database;
let auth: FakeAuth;
let users: FakeUserAdmin;
let token: string;
let invitationId: string;

const INVITED_AT = new Date("2026-11-12T06:00:00Z");
const at = (iso: string) => new Date(iso);
const PASSWORD = "0123456789";

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  auth = new FakeAuth();
  users = new FakeUserAdmin(database, auth);
  const owner = await insertAdmin(database, new FakeAuth(), { name: "Sarah" });
  const invited = await inviteAdmin(db, { name: "Anna", email: "anna@example.com", role: "owner", locale: "fr" }, { now: INVITED_AT, inviter: { id: owner.id, name: "Sarah" }, origin: "https://shop.test" });
  if (!invited.ok) throw new Error("invite failed");
  invitationId = invited.invitationId;
  const payload = (await database.client.query<{ payload: { link: string } }>("select payload from email_outbox")).rows[0]!.payload;
  token = payload.link.split("/admin/invite/")[1]!;
}, 60_000);

afterEach(async () => {
  await database.close();
});

const adminRows = async () => (await database.client.query<{ id: string; name: string; email: string; role: string; locale: string; active: boolean }>("select id, name, email, role, locale, active from admin where email = 'anna@example.com'")).rows;
const acceptedAt = async () => (await database.client.query<{ accepted_at: Date | null }>("select accepted_at from admin_invitation where id = $1", [invitationId])).rows[0]!.accepted_at;

describe("valid link (AC2)", () => {
  test("6 days 23 hours later: a confirmed Auth user and the admin row with the invited role; accepted_at set", async () => {
    const now = at("2026-11-19T05:00:00Z");

    const result = await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, now);

    expect(result).toMatchObject({ ok: true, email: "anna@example.com" });
    expect(users.created).toEqual([expect.objectContaining({ email: "anna@example.com", name: "Anna", locale: "en" })]);
    const [row] = await adminRows();
    expect(row).toMatchObject({ id: users.created[0]!.id, name: "Anna", role: "owner", locale: "en", active: true });
    expect((await acceptedAt())?.toISOString()).toBe(now.toISOString());
    expect(auth.passwordOf("anna@example.com")).toBe(PASSWORD);
  });

  test("the outbox row no longer holds the link once accepted", async () => {
    await acceptInvitation(db, users, token, { password: PASSWORD, locale: "fr" }, at("2026-11-13T06:00:00Z"));

    const payload = (await database.client.query<{ payload: Record<string, unknown> }>("select payload from email_outbox")).rows[0]!.payload;
    expect(payload.link).toBeUndefined();
  });
});

describe("expired, revoked or used (AC3)", () => {
  test("7 days and 1 minute later: INVITE_INVALID, nothing created", async () => {
    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, at("2026-11-19T06:01:00Z"))).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(users.created).toEqual([]);
    expect(await adminRows()).toEqual([]);
  });

  test("a revoked link: INVITE_INVALID, nothing created", async () => {
    await revokeInvite(db, invitationId, INVITED_AT);

    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(users.created).toEqual([]);
  });

  test("a second accept of the same link fails the same way", async () => {
    await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT);

    expect(await acceptInvitation(db, users, token, { password: "another password", locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(users.created).toHaveLength(1);
    expect(auth.passwordOf("anna@example.com")).toBe(PASSWORD);
  });

  test("an unknown or malformed token: INVITE_INVALID", async () => {
    expect(await acceptInvitation(db, users, "A".repeat(43), { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(await acceptInvitation(db, users, "short", { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "INVITE_INVALID" });
  });
});

describe("no orphan account (AC5)", () => {
  test("the Auth user is removed again when the admin row cannot be written", async () => {
    users.orphanNext = true;

    const result = await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT);

    expect(result).toEqual({ ok: false, code: "INTERNAL" });
    expect(users.deleted).toEqual([users.created[0]!.id]);
    expect(auth.hasUser("anna@example.com")).toBe(false);
    expect(await adminRows()).toEqual([]);
    expect(await acceptedAt()).toBeNull();
  });

  test("an Auth failure creates nothing and leaves the link usable", async () => {
    users.failWith = "failed";

    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "INTERNAL" });

    users.failWith = null;
    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toMatchObject({ ok: true });
  });

  test("a password Auth calls weak is a field problem, nothing created", async () => {
    users.failWith = "weak";

    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "WEAK_PASSWORD" });
    expect(await adminRows()).toEqual([]);
  });
});

describe("the address became a customer account (AC6)", () => {
  test("EMAIL_IN_USE and nothing created", async () => {
    const customerAuth = new FakeAuth();
    const customer = await insertCustomerAccount(database, customerAuth);
    await database.client.query("update customer set email = 'anna@example.com' where id = (select id from customer where email = $1)", [customer.email]);

    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "EMAIL_IN_USE" });
    expect(users.created).toEqual([]);
    expect(await adminRows()).toEqual([]);
    expect(await acceptedAt()).toBeNull();
  });

  test("an Auth account made elsewhere with that address: EMAIL_IN_USE from Auth, nothing created", async () => {
    await database.client.query("insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000aa', 'anna@example.com')");

    expect(await acceptInvitation(db, users, token, { password: PASSWORD, locale: "en" }, INVITED_AT)).toEqual({ ok: false, code: "EMAIL_IN_USE" });
    expect(await adminRows()).toEqual([]);
  });
});
