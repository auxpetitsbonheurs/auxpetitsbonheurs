// Admin invitations and the Team list (data-model "admin_invitation", S-027..S-030).
// An invitation is open while it is neither accepted nor revoked and `expires_at` is ahead.
// Its email is an outbox row keyed `admin_invitation:<id>`; the link (plaintext token)
// stays in that row's payload only until it is sent, dead or no longer needed.
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { admin, adminInvitation, customer, emailOutbox } from "~/db/schema";
import type { AdminRole } from "~/domain/admin-account";
import type { Locale } from "~/lib/locale";
import type { Executor } from "~/server/db.server";

export const INVITATION_TEMPLATE = "admin_invitation";
export const invitationDedupeKey = (invitationId: string) => `${INVITATION_TEMPLATE}:${invitationId}`;

export interface InvitationRecord {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  locale: Locale;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

const RECORD = {
  id: adminInvitation.id,
  email: adminInvitation.email,
  name: adminInvitation.name,
  role: adminInvitation.role,
  locale: adminInvitation.locale,
  expiresAt: adminInvitation.expiresAt,
  acceptedAt: adminInvitation.acceptedAt,
  revokedAt: adminInvitation.revokedAt,
};

export const isOpen = (row: InvitationRecord, now: Date) => row.acceptedAt === null && row.revokedAt === null && row.expiresAt.getTime() > now.getTime();

const sameEmail = (column: typeof admin.email | typeof customer.email | typeof adminInvitation.email, email: string) => sql`lower(${column}) = ${email.trim().toLowerCase()}`;

/** Who already has this address (S-028 AC4, S-029 AC6): an admin (active or not) or a customer account. */
export async function accountForEmail(db: Executor, email: string): Promise<{ kind: "admin"; active: boolean } | { kind: "customer" } | null> {
  const [found] = await db.select({ active: admin.active }).from(admin).where(sameEmail(admin.email, email)).limit(1);
  if (found) return { kind: "admin", active: found.active };
  const [account] = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(sameEmail(customer.email, email), sql`${customer.authUserId} is not null`))
    .limit(1);
  return account ? { kind: "customer" } : null;
}

export async function findInvitationById(db: Executor, id: string, options: { lock?: boolean } = {}): Promise<InvitationRecord | undefined> {
  const query = db.select(RECORD).from(adminInvitation).where(eq(adminInvitation.id, id)).limit(1);
  const [row] = options.lock ? await query.for("update") : await query;
  return row;
}

export async function findInvitationByHash(db: Executor, tokenHash: string): Promise<InvitationRecord | undefined> {
  const [row] = await db.select(RECORD).from(adminInvitation).where(eq(adminInvitation.tokenHash, tokenHash)).limit(1);
  return row;
}

/**
 * The emails of these invitations can no longer be used: the link leaves the payload and
 * a pending row becomes `dead` (never sent later by a retry).
 */
export async function retireInvitationEmails(db: Executor, invitationIds: string[], reason: string): Promise<void> {
  if (invitationIds.length === 0) return;
  await db
    .update(emailOutbox)
    .set({
      payload: sql`${emailOutbox.payload} - 'link'`,
      status: sql`case when ${emailOutbox.status} = 'pending' then 'dead'::email_status else ${emailOutbox.status} end`,
      lastError: sql`case when ${emailOutbox.status} = 'pending' then ${reason} else ${emailOutbox.lastError} end`,
    })
    .where(inArray(emailOutbox.dedupeKey, invitationIds.map(invitationDedupeKey)));
}

/** Revokes every not-yet-used invitation of this address (expired ones too) and retires their emails. */
export async function revokeInvitationsFor(db: Executor, email: string, now: Date): Promise<void> {
  const revoked = await db
    .update(adminInvitation)
    .set({ revokedAt: now })
    .where(and(sameEmail(adminInvitation.email, email), isNull(adminInvitation.acceptedAt), isNull(adminInvitation.revokedAt)))
    .returning({ id: adminInvitation.id });
  await retireInvitationEmails(db, revoked.map((r) => r.id), "revoked");
}

/** Revokes one invitation if it is still unused; `false` when it was accepted or revoked already. */
export async function revokeInvitation(db: Executor, id: string, now: Date): Promise<boolean> {
  const revoked = await db
    .update(adminInvitation)
    .set({ revokedAt: now })
    .where(and(eq(adminInvitation.id, id), isNull(adminInvitation.acceptedAt), isNull(adminInvitation.revokedAt)))
    .returning({ id: adminInvitation.id });
  await retireInvitationEmails(db, revoked.map((r) => r.id), "revoked");
  return revoked.length === 1;
}

export interface NewInvitation {
  email: string;
  name: string;
  role: AdminRole;
  locale: Locale;
  tokenHash: string;
  invitedBy: string;
  expiresAt: Date;
}

/** The invitation row and its outbox row (`payload` carries the link until sent). */
export async function insertInvitation(db: Executor, row: NewInvitation, payload: Record<string, unknown>): Promise<{ invitationId: string; outboxId: string }> {
  const [created] = await db.insert(adminInvitation).values(row).returning({ id: adminInvitation.id });
  const invitationId = created!.id;
  const [queued] = await db
    .insert(emailOutbox)
    .values({ template: INVITATION_TEMPLATE, toEmail: row.email, locale: row.locale, payload: { invitationId, ...payload }, dedupeKey: invitationDedupeKey(invitationId) })
    .returning({ id: emailOutbox.id });
  return { invitationId, outboxId: queued!.id };
}

/** Marks an open invitation accepted; `false` when it was used, revoked or expired meanwhile. */
export async function markAccepted(db: Executor, id: string, now: Date): Promise<boolean> {
  const accepted = await db
    .update(adminInvitation)
    .set({ acceptedAt: now })
    .where(and(eq(adminInvitation.id, id), isNull(adminInvitation.acceptedAt), isNull(adminInvitation.revokedAt), gt(adminInvitation.expiresAt, now)))
    .returning({ id: adminInvitation.id });
  return accepted.length === 1;
}

export interface TeamAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  active: boolean;
  lastSignInAt: Date | null;
}

export interface TeamInvite {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  expiresAt: Date;
  /** The invitation email failed (or is dead): Team shows "Email not sent, resend" (S-028 AC3). */
  emailFailed: boolean;
}

/** Team (S-027): every admin (Owners first, then by name), and the open invitations, newest first. */
export async function listTeam(db: Executor, now: Date): Promise<{ admins: TeamAdmin[]; invites: TeamInvite[] }> {
  const admins = await db
    .select({ id: admin.id, name: admin.name, email: admin.email, role: admin.role, active: admin.active, lastSignInAt: admin.lastSignInAt })
    .from(admin)
    .orderBy(sql`${admin.role} = 'owner' desc`, desc(admin.active), asc(sql`lower(${admin.name})`), asc(admin.id));
  const invites = await db
    .select({
      id: adminInvitation.id,
      name: adminInvitation.name,
      email: adminInvitation.email,
      role: adminInvitation.role,
      expiresAt: adminInvitation.expiresAt,
      emailFailed: sql<boolean>`coalesce(${emailOutbox.status} = 'dead' or (${emailOutbox.status} = 'pending' and ${emailOutbox.attempts} > 0), false)`,
    })
    .from(adminInvitation)
    .leftJoin(emailOutbox, eq(emailOutbox.dedupeKey, sql`${INVITATION_TEMPLATE} || ':' || ${adminInvitation.id}::text`))
    .where(and(isNull(adminInvitation.acceptedAt), isNull(adminInvitation.revokedAt), gt(adminInvitation.expiresAt, now)))
    .orderBy(desc(adminInvitation.createdAt), asc(adminInvitation.id));
  return { admins, invites: invites.map((row) => ({ ...row, emailFailed: Boolean(row.emailFailed) })) };
}
