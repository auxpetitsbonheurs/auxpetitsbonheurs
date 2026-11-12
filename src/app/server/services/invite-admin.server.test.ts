// S-028 invite and S-030 resend / revoke: the invitation row, its token hash and the
// outbox row, all in one transaction; refusals change nothing.
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { deliverInvitation } from "~/server/email/outbox.server";
import { insertAdmin, insertCustomerAccount } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { findOpenInvitation } from "./accept-invite.server";
import { inviteAdmin, resendInvite, revokeInvite } from "./invite-admin.server";

let database: TestDatabase;
let db: Database;
let owner: { id: string; email: string };

const NOW = new Date("2026-11-12T06:00:00Z");
const ORIGIN = "https://shop.test";

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  owner = await insertAdmin(database, new FakeAuth(), { name: "Sarah", role: "owner" });
}, 60_000);

afterEach(async () => {
  await database.close();
});

const context = (now = NOW) => ({ now, inviter: { id: owner.id, name: "Sarah" }, origin: ORIGIN });
const HELPER = { name: "Anna", email: "Anna@Example.com", role: "admin" as const, locale: "fr" as const };

async function invitations() {
  return (
    await database.client.query<{ id: string; email: string; name: string; role: string; locale: string; token_hash: string; expires_at: Date; revoked_at: Date | null; invited_by: string }>(
      "select id, email, name, role, locale, token_hash, expires_at, revoked_at, invited_by from admin_invitation order by created_at, id",
    )
  ).rows;
}

async function outbox() {
  return (
    await database.client.query<{ id: string; template: string; to_email: string; locale: string; payload: Record<string, unknown>; status: string; dedupe_key: string; attempts: number }>(
      "select id, template, to_email, locale, payload, status, dedupe_key, attempts from email_outbox order by created_at, id",
    )
  ).rows;
}

const tokenOf = (payload: Record<string, unknown>) => String(payload.link).split("/admin/invite/")[1]!;
const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

describe("invite (S-028 AC1)", () => {
  test("a row with a 7-day expiry and the SHA-256 of a 32-byte token, and a French outbox row", async () => {
    const result = await inviteAdmin(db, HELPER, context());

    expect(result).toMatchObject({ ok: true, email: "anna@example.com" });
    const [row] = await invitations();
    expect(row).toMatchObject({ email: "anna@example.com", name: "Anna", role: "admin", locale: "fr", invited_by: owner.id, revoked_at: null });
    expect(row!.expires_at.toISOString()).toBe("2026-11-19T06:00:00.000Z");
    const [queued] = await outbox();
    expect(queued).toMatchObject({ template: "admin_invitation", to_email: "anna@example.com", locale: "fr", status: "pending", dedupe_key: `admin_invitation:${row!.id}` });
    const token = tokenOf(queued!.payload);
    expect(queued!.payload.link).toBe(`${ORIGIN}/admin/invite/${token}`);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(row!.token_hash).toBe(sha256(token));
    expect(queued!.payload).toMatchObject({ inviterName: "Sarah", role: "admin", expiresOn: "2026-11-19" });
  });

  test("two invitations never share a token", async () => {
    await inviteAdmin(db, HELPER, context());
    await inviteAdmin(db, { ...HELPER, email: "bea@example.com" }, context());

    const [a, b] = await invitations();
    expect(a!.token_hash).not.toBe(b!.token_hash);
  });

  test("inviting an address with an open invitation replaces it: the old link stops working", async () => {
    await inviteAdmin(db, HELPER, context());
    const oldToken = tokenOf((await outbox())[0]!.payload);

    await inviteAdmin(db, { ...HELPER, role: "owner" }, context());

    expect(await findOpenInvitation(db, oldToken, NOW)).toBeNull();
    const rows = await invitations();
    expect(rows.filter((r) => r.revoked_at === null)).toHaveLength(1);
    expect(rows.at(-1)!.role).toBe("owner");
  });
});

describe("email already used (S-028 AC4)", () => {
  test.each([
    ["an active admin", true, false],
    ["a deactivated admin", false, true],
  ])("%s: EMAIL_IN_USE and no row", async (_label, active, deactivated) => {
    await insertAdmin(database, new FakeAuth(), { email: "anna@example.com", role: "admin", active });

    expect(await inviteAdmin(db, HELPER, context())).toEqual({ ok: false, code: "EMAIL_IN_USE", deactivated });
    expect(await invitations()).toEqual([]);
    expect(await outbox()).toEqual([]);
  });

  test("a customer account: EMAIL_IN_USE and no row", async () => {
    const customer = await insertCustomerAccount(database, new FakeAuth());

    expect(await inviteAdmin(db, { ...HELPER, email: customer.email.toUpperCase() }, context())).toEqual({ ok: false, code: "EMAIL_IN_USE", deactivated: false });
    expect(await invitations()).toEqual([]);
  });

  test("a guest customer (orders, no account) can be invited", async () => {
    await database.client.query("insert into customer (name, phone, email) values ('Anna', '+23057000001', 'anna@example.com')");

    expect(await inviteAdmin(db, HELPER, context())).toMatchObject({ ok: true });
  });
});

describe("resend (S-030 AC1, AC5)", () => {
  test("revokes the old row, creates a new one for 7 more days and queues a new email; only the new link works", async () => {
    const first = await inviteAdmin(db, HELPER, context());
    if (!first.ok) throw new Error("invite failed");
    const oldToken = tokenOf((await outbox())[0]!.payload);
    const later = new Date("2026-11-14T06:00:00Z");

    const result = await resendInvite(db, first.invitationId, context(later));

    expect(result).toMatchObject({ ok: true, email: "anna@example.com" });
    const rows = await invitations();
    expect(rows).toHaveLength(2);
    expect(rows[0]!.revoked_at).not.toBeNull();
    expect(rows[1]).toMatchObject({ revoked_at: null, name: "Anna", role: "admin", locale: "fr" });
    expect(rows[1]!.expires_at.toISOString()).toBe("2026-11-21T06:00:00.000Z");
    const [oldMail, newMail] = await outbox();
    // The old email can no longer be sent, and its link is gone from the payload.
    expect(oldMail).toMatchObject({ status: "dead" });
    expect(oldMail!.payload.link).toBeUndefined();
    expect(await findOpenInvitation(db, oldToken, later)).toBeNull();
    expect(await findOpenInvitation(db, tokenOf(newMail!.payload), later)).toMatchObject({ email: "anna@example.com" });
  });

  test("a failed send on resend keeps the new row and its pending email (AC5)", async () => {
    const first = await inviteAdmin(db, HELPER, context());
    if (!first.ok) throw new Error("invite failed");
    const resent = await resendInvite(db, first.invitationId, context());
    if (!resent.ok) throw new Error("resend failed");
    const failing = { send: async () => Promise.reject(new Error("down")) };

    await deliverInvitation(db, failing, resent.outboxId, { now: NOW });

    expect((await invitations()).filter((r) => r.revoked_at === null)).toHaveLength(1);
    expect((await outbox()).at(-1)).toMatchObject({ status: "pending", attempts: 1 });
  });
});

describe("revoke (S-030 AC2)", () => {
  test("the link stops working and the invitation leaves the open list", async () => {
    const first = await inviteAdmin(db, HELPER, context());
    if (!first.ok) throw new Error("invite failed");
    const token = tokenOf((await outbox())[0]!.payload);

    expect(await revokeInvite(db, first.invitationId, NOW)).toEqual({ ok: true, email: "anna@example.com" });

    expect(await findOpenInvitation(db, token, NOW)).toBeNull();
    expect((await outbox())[0]!.payload.link).toBeUndefined();
  });
});

describe("refusals change nothing (S-030 AC3)", () => {
  test("unknown id: NOT_FOUND", async () => {
    const unknown = "00000000-0000-4000-8000-000000000000";

    expect(await resendInvite(db, unknown, context())).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await revokeInvite(db, unknown, NOW)).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await invitations()).toEqual([]);
  });

  test("a revoked invitation: INVITE_INVALID for both, no new row", async () => {
    const first = await inviteAdmin(db, HELPER, context());
    if (!first.ok) throw new Error("invite failed");
    await revokeInvite(db, first.invitationId, NOW);

    expect(await resendInvite(db, first.invitationId, context())).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(await revokeInvite(db, first.invitationId, NOW)).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(await invitations()).toHaveLength(1);
  });

  test("an accepted invitation: INVITE_INVALID for both", async () => {
    const first = await inviteAdmin(db, HELPER, context());
    if (!first.ok) throw new Error("invite failed");
    await database.client.query("update admin_invitation set accepted_at = now() where id = $1", [first.invitationId]);

    expect(await resendInvite(db, first.invitationId, context())).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(await revokeInvite(db, first.invitationId, NOW)).toEqual({ ok: false, code: "INVITE_INVALID" });
    expect(await invitations()).toHaveLength(1);
  });
});
