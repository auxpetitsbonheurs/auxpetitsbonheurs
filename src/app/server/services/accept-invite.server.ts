// `admin/invite` accept (S-029, FR-042): an open invitation becomes a confirmed Auth user
// and an `admin` row with the invited role, exactly once. The role, name and email come
// from the invitation row, never from the form. The Auth call (5 s) runs outside the
// transaction; the row update then re-checks the invitation is still open, and any
// failure after the Auth user exists removes it again (AC5: no orphan account).
import { admin } from "~/db/schema";
import type { Locale } from "~/lib/locale";
import type { Database, Executor } from "~/server/db.server";
import { invitationTokenHash, isInvitationToken } from "~/server/invite-token.server";
import {
  type InvitationRecord,
  accountForEmail,
  findInvitationByHash,
  isOpen,
  markAccepted,
  retireInvitationEmails,
} from "~/server/repos/invitations.server";
import type { UserAdmin } from "~/server/user-admin.server";

/** The open invitation for this link, or null (malformed tokens never reach the database: AC7). */
export async function findOpenInvitation(db: Executor, token: unknown, now: Date): Promise<InvitationRecord | null> {
  if (!isInvitationToken(token)) return null;
  const row = await findInvitationByHash(db, await invitationTokenHash(token));
  return row && isOpen(row, now) ? row : null;
}

export type AcceptOutcome =
  | { ok: true; userId: string; email: string }
  | { ok: false; code: "INVITE_INVALID" | "EMAIL_IN_USE" | "WEAK_PASSWORD" | "INTERNAL" };

class InvitationGone extends Error {
  constructor() {
    super("invitation no longer open");
    this.name = "InvitationGone";
  }
}

const log = (event: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", event, ...extra }));

/** Accepted row + admin row in one transaction; throws InvitationGone when it was used meanwhile. */
async function recordAcceptance(db: Database, invitation: InvitationRecord, userId: string, locale: Locale, now: Date) {
  await db.transaction(async (tx) => {
    if (!(await markAccepted(tx, invitation.id, now))) throw new InvitationGone();
    await tx.insert(admin).values({ id: userId, name: invitation.name, email: invitation.email, role: invitation.role, locale, active: true });
    await retireInvitationEmails(tx, [invitation.id], "accepted");
  });
}

export async function acceptInvitation(
  db: Database,
  users: UserAdmin,
  token: unknown,
  input: { password: string; locale: Locale },
  now: Date,
): Promise<AcceptOutcome> {
  const invitation = await findOpenInvitation(db, token, now);
  if (!invitation) return { ok: false, code: "INVITE_INVALID" };
  if (await accountForEmail(db, invitation.email)) return { ok: false, code: "EMAIL_IN_USE" };
  const created = await users.createUser({ email: invitation.email, password: input.password, name: invitation.name, locale: input.locale });
  if (!created.ok) {
    if (created.reason === "exists") return { ok: false, code: "EMAIL_IN_USE" };
    return { ok: false, code: created.reason === "weak" ? "WEAK_PASSWORD" : "INTERNAL" };
  }
  try {
    await recordAcceptance(db, invitation, created.userId, input.locale, now);
  } catch (error) {
    const removed = await users.deleteUser(created.userId);
    // No address or name in the log: the invitation id is enough to find it.
    console.error(JSON.stringify({ level: "error", event: "admin_invite_accept_failed", invitationId: invitation.id, authUserRemoved: removed, error: error instanceof Error ? error.name : typeof error }));
    return { ok: false, code: error instanceof InvitationGone ? "INVITE_INVALID" : "INTERNAL" };
  }
  log("admin_invite_accepted", { role: invitation.role });
  return { ok: true, userId: created.userId, email: invitation.email };
}
