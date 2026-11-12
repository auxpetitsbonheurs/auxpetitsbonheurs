// S-028 AC2, AC3: the invitation email leaves the outbox after commit; success scrubs the
// token from the payload, a failure or timeout keeps the row pending for "resend".
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { type TestDatabase, createTestDatabase } from "~/db/testing/pglite";
import type { Database } from "~/server/db.server";
import { inviteAdmin } from "~/server/services/invite-admin.server";
import { insertAdmin } from "~/server/testing/admins";
import { FakeAuth } from "~/server/testing/fake-auth";
import { deliverInvitation } from "./outbox.server";
import type { EmailMessage, Mailer } from "./sender.server";

let database: TestDatabase;
let db: Database;
let outboxId: string;

const NOW = new Date("2026-11-12T06:00:00Z");

beforeEach(async () => {
  database = await createTestDatabase();
  db = database.db as unknown as Database;
  const owner = await insertAdmin(database, new FakeAuth(), { name: "Sarah" });
  const invited = await inviteAdmin(db, { name: "Anna", email: "anna@example.com", role: "admin", locale: "fr" }, { now: NOW, inviter: { id: owner.id, name: "Sarah" }, origin: "https://shop.test" });
  if (!invited.ok) throw new Error("invite failed");
  outboxId = invited.outboxId;
}, 60_000);

afterEach(async () => {
  await database.close();
});

async function row() {
  return (
    await database.client.query<{ status: string; attempts: number; last_error: string | null; provider_id: string | null; payload: Record<string, unknown>; sent_at: Date | null }>(
      "select status, attempts, last_error, provider_id, payload, sent_at from email_outbox where id = $1",
      [outboxId],
    )
  ).rows[0]!;
}

const invitationsLeft = async () => (await database.client.query("select id from admin_invitation where revoked_at is null")).rows.length;

describe("after commit (AC2)", () => {
  test("a delivered email marks the row sent and removes the link from its payload", async () => {
    const sent: EmailMessage[] = [];
    const mailer: Mailer = { send: async (message) => (sent.push(message), { id: "re-42" }) };

    expect(await deliverInvitation(db, mailer, outboxId, { now: NOW })).toBe("sent");

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "anna@example.com", idempotencyKey: `outbox-${outboxId}` });
    expect(sent[0]!.text).toMatch(/\/admin\/invite\/[A-Za-z0-9_-]{43}/);
    expect(sent[0]!.html).toContain('lang="fr"');
    const after = await row();
    expect(after).toMatchObject({ status: "sent", provider_id: "re-42", attempts: 1, last_error: null });
    expect(after.payload.link).toBeUndefined();
    expect(JSON.stringify(after.payload)).not.toMatch(/[A-Za-z0-9_-]{43}/);
  });

  test("a sent row is not sent twice", async () => {
    let calls = 0;
    const mailer: Mailer = { send: async () => (calls++, { id: "re-1" }) };

    await deliverInvitation(db, mailer, outboxId, { now: NOW });

    expect(await deliverInvitation(db, mailer, outboxId, { now: NOW })).toBe("skipped");
    expect(calls).toBe(1);
  });
});

describe("only live links go out (review)", () => {
  test("an invitation that expired before its email went out is never sent; its link is dropped", async () => {
    let calls = 0;
    const mailer: Mailer = { send: async () => (calls++, { id: "re-1" }) };

    expect(await deliverInvitation(db, mailer, outboxId, { now: new Date("2026-11-19T06:00:01Z") })).toBe("skipped");

    expect(calls).toBe(0);
    const after = await row();
    expect(after.status).toBe("dead");
    expect(after.payload.link).toBeUndefined();
  });
});

describe("failure (AC3)", () => {
  test("a provider failure keeps the invitation and the pending row, with the kind only", async () => {
    const mailer: Mailer = { send: async () => Promise.reject(new Error("401 key re_secret invalid")) };

    expect(await deliverInvitation(db, mailer, outboxId, { now: NOW })).toBe("failed");

    const after = await row();
    expect(after).toMatchObject({ status: "pending", attempts: 1, last_error: "network" });
    expect(after.payload.link).toEqual(expect.stringContaining("/admin/invite/"));
    expect(await invitationsLeft()).toBe(1);
  });

  test("no answer within the deadline is a timeout", async () => {
    const mailer: Mailer = { send: () => new Promise(() => {}) };

    expect(await deliverInvitation(db, mailer, outboxId, { now: NOW, timeoutMs: 20 })).toBe("failed");

    expect(await row()).toMatchObject({ status: "pending", attempts: 1, last_error: "timeout" });
  });

  test("without Resend configured, the attempt is recorded so Team can say the email was not sent", async () => {
    expect(await deliverInvitation(db, null, outboxId, { now: NOW })).toBe("not_configured");

    expect(await row()).toMatchObject({ status: "pending", attempts: 1, last_error: "not_configured" });
  });
});
