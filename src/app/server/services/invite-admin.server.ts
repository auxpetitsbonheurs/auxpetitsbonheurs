// `admin/team` invite, resendInvite and revokeInvite (S-028, S-030; FR-042). Each runs in
// one transaction: the invitation row (only the token's hash) and its outbox row (the link)
// commit together, and the route sends the email after the response (`deliverInvitation`).
import { INVITE_VALID_DAYS } from "~/domain/admin-account";
import { todayMU } from "~/domain/time";
import type { Database, Executor } from "~/server/db.server";
import { invitationLink, invitationTokenHash, newInvitationToken } from "~/server/invite-token.server";
import type { InviteFields } from "~/server/contracts/admin";
import {
  type InvitationRecord,
  accountForEmail,
  findInvitationById,
  insertInvitation,
  revokeInvitation,
  revokeInvitationsFor,
} from "~/server/repos/invitations.server";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface InviteContext {
  now: Date;
  /** The Owner sending it (their name goes in the email). */
  inviter: { id: string; name: string };
  /** The site's own origin: the link is built on it, never on a header the client chose. */
  origin: string;
}

export type Queued = { ok: true; invitationId: string; outboxId: string; email: string };
export type InviteOutcome = Queued | { ok: false; code: "EMAIL_IN_USE"; deactivated: boolean };
export type InviteChangeOutcome = { ok: false; code: "NOT_FOUND" | "INVITE_INVALID" };

/** A fresh token, its row and its email; the plaintext token only ever goes into the email's link. */
async function issue(tx: Executor, person: Pick<InvitationRecord, "email" | "name" | "role" | "locale">, context: InviteContext): Promise<Queued> {
  const token = newInvitationToken();
  const expiresAt = new Date(context.now.getTime() + INVITE_VALID_DAYS * DAY_MS);
  const { invitationId, outboxId } = await insertInvitation(
    tx,
    { email: person.email, name: person.name, role: person.role, locale: person.locale, tokenHash: await invitationTokenHash(token), invitedBy: context.inviter.id, expiresAt },
    { inviterName: context.inviter.name, role: person.role, expiresOn: todayMU(expiresAt), link: invitationLink(context.origin, token) },
  );
  return { ok: true, invitationId, outboxId, email: person.email };
}

/**
 * invite (S-028 AC1, AC4): refused with EMAIL_IN_USE when the address already belongs to an
 * admin (active or deactivated) or a customer account; an earlier unused invitation of the
 * same address is revoked first, so only the newest link works.
 */
export async function inviteAdmin(db: Database, input: InviteFields, context: InviteContext): Promise<InviteOutcome> {
  const person = { ...input, email: input.email.trim().toLowerCase() };
  return db.transaction(async (tx) => {
    const account = await accountForEmail(tx, person.email);
    if (account) return { ok: false as const, code: "EMAIL_IN_USE" as const, deactivated: account.kind === "admin" && !account.active };
    await revokeInvitationsFor(tx, person.email, context.now);
    return issue(tx, person, context);
  });
}

/** resendInvite (S-030 AC1): the old row is revoked (its link dies) and a new one starts 7 more days. */
export async function resendInvite(db: Database, id: string, context: InviteContext): Promise<Queued | InviteChangeOutcome> {
  return db.transaction(async (tx) => {
    const current = await findInvitationById(tx, id, { lock: true });
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
    if (current.acceptedAt || current.revokedAt) return { ok: false as const, code: "INVITE_INVALID" as const };
    await revokeInvitationsFor(tx, current.email, context.now);
    return issue(tx, current, context);
  });
}

/** revokeInvite (S-030 AC2): the link answers INVITE_INVALID from now on. */
export async function revokeInvite(db: Database, id: string, now: Date): Promise<{ ok: true; email: string } | InviteChangeOutcome> {
  return db.transaction(async (tx) => {
    const current = await findInvitationById(tx, id, { lock: true });
    if (!current) return { ok: false as const, code: "NOT_FOUND" as const };
    if (!(await revokeInvitation(tx, id, now))) return { ok: false as const, code: "INVITE_INVALID" as const };
    return { ok: true as const, email: current.email };
  });
}
